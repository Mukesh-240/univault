/**
 * EVALUATION HARNESS — runs the real engines on generated data and compares with the labels.
 *
 * Plain-English picture:
 *   For every generated test case, this file:
 *     1. turns the case's documents into the same in-memory shape the app uses (no labels, no
 *        "synthetic" flag — engines can't see either),
 *     2. runs the relevant engine (name matching, expiry, verification, OCR confidence, ...),
 *     3. compares the engine's answer with the label written by the generator ("by construction"),
 *     4. files the result as a true/false positive/negative so we can report precision and recall.
 *
 *   This is the ONLY place (with the tests) that reads labels. It lives outside src/ on purpose.
 *
 * Counting rules (stated so the numbers can be checked):
 *   - "positive" = the label expects an alarm/detection (expired, tampered, injected, duplicate,
 *     over-broad, same person for name matching...). Negative = expects none.
 *   - A positive case only counts as a TRUE positive if the engine's answer matches IN DETAIL
 *     (e.g. the exact mismatched field, the exact number of days); a wrong detail counts as missed.
 *   - Any alarm on a negative case is a false alarm.
 */
import { generateKeyPairSync } from "node:crypto";
import { getReady } from "../src/lib/assistant";
import { dobConsistency, findDuplicates } from "../src/lib/duplicates";
import { scanDocument } from "../src/lib/injection";
import { matchNames } from "../src/lib/names";
import { checkRequest } from "../src/lib/overbroad";
import { signEntries, type IssuerRecord } from "../src/lib/registry";
import { candidatePairs } from "../src/lib/resolution";
import { reviewHints } from "../src/lib/ocr";
import { ageAtLeastFor, LOW_CONFIDENCE, notExpiredFor, type RulePack } from "../src/lib/rules";
import { checkExpiry, decideCodeRequest, decideDownload, decideOpen, hashCode, hashDevice, matchLeak, newSessionCode, type LinkFacts, type NotifyKind, type PastAccess } from "../src/lib/shares";
import { contextFor, type VaultDoc } from "../src/lib/vault";
import { watermarkLabel } from "../src/lib/watermark";
import { decideVerification, withFreshness, type IssuerReply, type VerifyOutcome } from "../src/lib/verify";
import type { Dataset, DatasetDoc, LabelCase, Labels } from "../synthetic/generate";

// ─────────────────────────── Setup helpers ───────────────────────────

/** The dataset document -> the engines' document shape. Drops the label-ish parts (ref kept only as the id). */
export const toVaultDoc = (d: DatasetDoc): VaultDoc => ({
  id: d.ref, doc_type: d.doc_type, title: d.title, issuer: d.issuer, serial: d.serial, capture: d.capture,
  fields: d.fields, body_text: d.body_text ?? null, hidden_text: d.hidden_text ?? null, ocr_confidence: d.ocr_confidence ?? null,
});

/** A stand-in for the simulated issuer: signs the dataset's registry with a throw-away key pair. */
export function makeIssuer(registry: Dataset["registry"]) {
  const k = generateKeyPairSync("ed25519");
  const priv = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const pub = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const bySerial = new Map<string, ReturnType<typeof signEntries>>();
  for (const e of signEntries(registry as IssuerRecord[], priv)) bySerial.set(e.serial, [...(bySerial.get(e.serial) ?? []), e]);
  for (const list of bySerial.values()) list.sort((a, b) => b.version - a.version);
  return { pub, reply: (serial: string | null): IssuerReply => ({ reachable: true, history: serial ? bySerial.get(serial) ?? [] : [] }) };
}
export type Issuer = ReturnType<typeof makeIssuer>;

/** "Now" for a dataset: its reference date at 06:00 UTC (11:30 in India, the same calendar day). */
export const nowFor = (referenceDate: string) => new Date(`${referenceDate}T06:00:00Z`);

/** Verify one document the way the service does (digital: as is; scan: only after confirmation). */
export function verifyDoc(d: VaultDoc, issuer: Issuer, now: Date, conditions: Record<string, unknown> = {}): VerifyOutcome {
  const reply = conditions.issuer_down ? { reachable: false, history: [] } : issuer.reply(d.serial);
  const kind = d.capture === "digital" ? "digital" : "scan";
  const hours = typeof conditions.last_verified_hours_ago === "number" ? conditions.last_verified_hours_ago : 0;
  if (!hours) return decideVerification(d.fields, kind, reply, issuer.pub, now);
  // Verified some hours ago; looked at now -> may be stale.
  return withFreshness(decideVerification(d.fields, kind, reply, issuer.pub, new Date(now.getTime() - hours * 3_600_000)), now);
}

/** Classify an outcome the way labels name states (adds issuer_updated / stale and the unverifiable reason). */
export function verifyLabel(o: VerifyOutcome): { state: string; reason?: string } {
  if (o.issuerUpdate) return { state: "issuer_updated" };
  if (o.freshness === "stale") return { state: "stale" };
  if (o.state !== "unverifiable") return { state: o.state };
  return { state: "unverifiable", reason: o.retry ? "issuer_unreachable" : o.signatureValid === false ? "signature_invalid" : "no_record" };
}

const sameSet = (a: unknown, b: unknown) => JSON.stringify([...((a as string[]) ?? [])].sort()) === JSON.stringify([...((b as string[]) ?? [])].sort());

// ─────────────────────────── Per-case evaluation ───────────────────────────

export interface CaseResult {
  case_id: string; dimension: string; level: string; detector: string;
  evaluated: boolean;          // false = detector not built yet (e.g. sharing: Phase 4)
  expectedPositive: boolean; predictedPositive: boolean; correct: boolean;
  note?: string;
  ocrFields?: { field: string; confidence: number; misread: boolean }[];
}

/** Everything about one generated set that the evaluation needs. */
export interface Bench { data: Dataset; labels: Labels; docs: Map<string, VaultDoc>; issuer: Issuer; now: Date; today: string; packs: RulePack[] }

export function makeBench(data: Dataset, labels: Labels, packs: RulePack[]): Bench {
  return { data, labels, packs, docs: new Map(data.documents.map((d) => [d.ref, toVaultDoc(d)])), issuer: makeIssuer(data.registry), now: nowFor(data.meta.reference_date), today: data.meta.reference_date };
}

/** All alarms the engines raise for a set of documents (used for negative controls). */
export function alarmsFor(docs: VaultDoc[], b: Pick<Bench, "issuer" | "now" | "today">): string[] {
  const ctx = contextFor(docs, b.today);
  const alarms: string[] = [];
  for (const d of docs) {
    if (d.serial) { const v = verifyDoc(d, b.issuer, b.now); if (v.state !== "verified") alarms.push(`verify:${d.doc_type}:${v.state}`); }
    if (notExpiredFor(d, ctx).status === "fail") alarms.push(`expired:${d.doc_type}`);
    if (scanDocument(d).suspected) alarms.push(`injection:${d.doc_type}`);
    if (reviewHints(d).length) alarms.push(`ocr_low_confidence:${d.doc_type}`);
  }
  for (const p of findDuplicates(docs)) alarms.push(`duplicate:${p.kind}`);
  if (dobConsistency(docs).consistent === false) alarms.push("dob_mismatch");
  for (const p of candidatePairs(docs)) if (p.verdict === "unlikely") alarms.push(`names_differ:${p.fieldA}/${p.fieldB}`);
  return alarms;
}

/** For an OCR case: does the readiness assistant ask the person to confirm the scan (i.e. scan_confirmed is "unknown")? */
function scanStillUnconfirmed(d: VaultDoc, b: Bench): boolean {
  const pack = b.packs.find((p) => p.rules.some((r) => r.predicate === "scan_confirmed"));
  if (!pack) return false;
  return getReady(pack.id, contextFor([d], b.today), b.packs).cards.some((c) => c.kind === "confirm_scan" && c.documentIds.includes(d.id));
}

export function evaluateCase(c: LabelCase, b: Bench): CaseResult {
  const e = c.expected as Record<string, unknown>;
  const detector = String(e.detector);
  const base = { case_id: c.case_id, dimension: c.dimension, level: c.level, detector };
  const doc = (ref: unknown) => b.docs.get(String(ref))!;
  const ctx = (docs: VaultDoc[]) => contextFor(docs, b.today);
  const done = (expectedPositive: boolean, predictedPositive: boolean, correct: boolean, note?: string, extra: Partial<CaseResult> = {}): CaseResult =>
    ({ ...base, evaluated: true, expectedPositive, predictedPositive, correct, note, ...extra });

  switch (detector) {
    case "name_match": {
      const [a, z] = (e.pair as string[]).map(doc);
      const p = candidatePairs([a, z])[0];
      const predicted = !!p && p.verdict !== "unlikely";
      return done(e.same_person === true, predicted, predicted === e.same_person, p ? `${p.verdict} ${p.score}` : "no names");
    }
    case "not_expired":
    case "issue_date_valid": {
      const d = doc(e.doc);
      const o = notExpiredFor(d, ctx([d]));
      const correct = detector === "issue_date_valid"
        ? o.status === "fail" && o.detail?.notYetValid === true
        : o.status === e.result && (e.days_expired === undefined || o.detail?.daysExpired === e.days_expired);
      return done(e.result === "fail", o.status === "fail", correct, o.reason);
    }
    case "age_at_least": {
      const d = doc(e.doc);
      const o = ageAtLeastFor(d, ctx([d]), Number(e.years));
      return done(e.result === "fail", o.status === "fail", o.status === e.result, o.reason);
    }
    case "dob_consistent": {
      const r = dobConsistency((e.pair as string[]).map(doc));
      return done(false, r.consistent !== true, r.consistent === true, r.reason);
    }
    case "issuer_verify": {
      const o = verifyDoc(doc(e.doc), b.issuer, b.now, c.conditions);
      const got = verifyLabel(o);
      let correct = got.state === e.state && (e.reason === undefined || got.reason === e.reason);
      if (correct && e.mismatched_fields) correct = sameSet(o.mismatchedFields, e.mismatched_fields);
      if (correct && e.changed_fields) correct = sameSet(o.issuerUpdate?.changedFields, e.changed_fields);
      return done(e.state !== "verified", got.state !== "verified", correct, `${got.state}${got.reason ? `/${got.reason}` : ""} ${o.mismatchedFields.join(",")}`);
    }
    case "ocr": {
      const d = doc(e.doc);
      const misread = new Set(e.misread_fields as string[]);
      const ocrFields = Object.keys(d.fields).map((f) => ({ field: f, confidence: d.ocr_confidence?.[f] ?? 0, misread: misread.has(f) }));
      const flagged = new Set(reviewHints(d).map((h) => h.field));
      const allCaught = [...misread].every((f) => flagged.has(f));
      return done(misread.size > 0, flagged.size > 0, allCaught && scanStillUnconfirmed(d, b), `flagged ${[...flagged].join(",") || "none"}; misread ${[...misread].join(",") || "none"}`, { ocrFields });
    }
    case "duplicate": {
      const pairs = findDuplicates((e.pair as string[]).map(doc));
      return done(true, pairs.length > 0, pairs.some((p) => p.kind === e.kind), pairs.map((p) => p.kind).join(",") || "none");
    }
    case "injection": {
      const s = scanDocument(doc(e.doc));
      return done(e.flagged === true, s.suspected, s.suspected === e.flagged, s.hits.join("; ") || "clean");
    }
    case "over_broad": {
      const req = b.data.requests.find((r) => r.ref === e.request)!;
      const r = checkRequest(req, b.packs);
      let correct = r.flagged === e.flagged;
      if (correct && Array.isArray(e.extra) && e.reason !== "purpose_mismatch") correct = sameSet(r.extra, e.extra);
      if (correct && e.minimal_alternative) correct = Object.values(r.alternatives).includes(String(e.minimal_alternative));
      if (correct && e.reason === "purpose_mismatch") correct = r.purposeMismatch;
      return done(e.flagged === true, r.flagged, correct, r.reasons.join(" ") || "ok");
    }
    case "all": {
      const alarms = alarmsFor((e.docs as string[]).map(doc), b);
      return done(false, alarms.length > 0, alarms.length === 0, alarms.join(", ") || "no alarm");
    }
    case "share_access": {
      // Every step's result (and notification, where the label names one) must match, in order.
      const sc = b.data.scenarios.find((s) => s.ref === e.scenario)!;
      const want = e.outcomes as { result: string; notify?: string }[];
      const got = replayScenario(b, sc).steps;
      const correct = got.length === want.length && want.every((w, i) => got[i].result === w.result && (w.notify === undefined || got[i].notify === w.notify));
      const isAlarm = (r: string) => r.startsWith("denied") || r.startsWith("rejected");
      return done(want.some((w) => isAlarm(w.result)), got.some((g) => isAlarm(g.result)), correct, got.map((g) => g.result + (g.notify ? `(${g.notify})` : "")).join(" "));
    }
    default:
      return { ...base, evaluated: false, expectedPositive: false, predictedPositive: false, correct: false, note: `no detector for "${detector}"` };
  }
}

// ─────────────────────────── Aggregation ───────────────────────────

export interface Metrics { cases: number; evaluated: number; correct: number; tp: number; fp: number; tn: number; fn: number; precision: number | null; recall: number | null; falseAlarms: number }

export function metricsOf(results: CaseResult[]): Metrics {
  const ev = results.filter((r) => r.evaluated);
  const count = (f: (r: CaseResult) => boolean) => ev.filter(f).length;
  const tp = count((r) => r.expectedPositive && r.correct);
  const fn = count((r) => r.expectedPositive && !r.correct);
  const tn = count((r) => !r.expectedPositive && r.correct);
  const fp = count((r) => !r.expectedPositive && !r.correct);
  return { cases: results.length, evaluated: ev.length, correct: tp + tn, tp, fp, tn, fn,
    precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, falseAlarms: fp };
}

/** Run every case of a set; returns the per-case results. */
export const runAll = (b: Bench): CaseResult[] => b.labels.cases.map((c) => evaluateCase(c, b));

/** Group by dimension -> metrics. */
export function byDimension(results: CaseResult[]): Record<string, Metrics> {
  const groups = new Map<string, CaseResult[]>();
  for (const r of results) groups.set(r.dimension, [...(groups.get(r.dimension) ?? []), r]);
  return Object.fromEntries([...groups].map(([k, v]) => [k, metricsOf(v)]));
}

/** OCR calibration: for each confidence band, how many fields and how many of them were actually misread. */
export function ocrCalibration(results: CaseResult[]) {
  const bands = [[0, 0.5], [0.5, 0.7], [0.7, 0.85], [0.85, 1.01]] as const;
  const fields = results.flatMap((r) => r.ocrFields ?? []);
  return bands.map(([lo, hi]) => {
    const inBand = fields.filter((f) => f.confidence >= lo && f.confidence < hi);
    const wrong = inBand.filter((f) => f.misread).length;
    return { band: `${lo.toFixed(2)}–${Math.min(hi, 1).toFixed(2)}`, fields: inBand.length, misread: wrong, errorRate: inBand.length ? wrong / inBand.length : null };
  });
}

// ─────────────────────────── Showcase: the 17 planted conflicts ───────────────────────────

export interface ConflictCheck { id: number; title: string; detected: boolean | null; evidence: string }

/** Run the detector for each planted conflict in the showcase set. null = detector not built yet. */
/**
 * Replay a generated share scenario through the SAME rules the recipient pages use (shares.ts:
 * checkExpiry, decideCodeRequest, decideOpen, decideDownload, matchLeak). The only translation here is
 * test-oracle wording: "correct"/"wrong" recipient IDs and "fresh"/"reused"/"wrong" codes become concrete
 * values, and each step's result is written in the labels' vocabulary. The decisions themselves are the app's.
 */
export function replayScenario(b: Bench, sc: Dataset["scenarios"][number]) {
  const rec = b.data.recipients.find((r) => r.purpose === sc.recipient_purpose)!;
  type Step = { result: string; notify: NotifyKind | null; session?: string };
  const steps: Step[] = [];
  const created = checkExpiry(new Date(b.now.getTime() + sc.expiry_days * 86_400_000).toISOString(), b.now);
  if (!created.ok) return { steps: [{ result: `rejected_at_creation:${created.reason}`, notify: null }], leakResolvesTo: null };
  const newLink = (): { link: LinkFacts; past: PastAccess[]; lastCode: string | null; openedSession: string | null } => ({
    link: { shareRevoked: false, tokenKilled: false, expiresAt: new Date(b.now.getTime() + sc.expiry_days * 86_400_000).toISOString(),
      maxViews: sc.policy.max_views, recipientCode: rec.recipient_code, policy: sc.policy.mode },
    past: [], lastCode: null, openedSession: null });
  const main = newLink();
  let other: ReturnType<typeof newLink> | null = null;
  let codeCounter = 100000;
  const open = (L: ReturnType<typeof newLink>, idOk: boolean, otp: "fresh" | "reused" | "wrong", device: string): Step => {
    const a = { recipientId: idOk ? rec.recipient_code : `${rec.recipient_code}9`, deviceHash: hashDevice(device), now: b.now };
    let code = otp === "reused" ? L.lastCode ?? "000000" : "000000";
    if (otp === "fresh") {
      const req = decideCodeRequest(L.link, a);
      if (req.outcome !== "code_issued") { L.past.push({ outcome: req.outcome, deviceHash: a.deviceHash }); return { result: req.outcome, notify: req.notify }; }
      code = String(codeCounter++);
      L.past.push({ outcome: "code_issued", deviceHash: a.deviceHash, codeHash: hashCode(code), at: b.now.toISOString() });
    }
    const d = decideOpen(L.link, { ...a, code }, L.past);
    L.past.push({ outcome: d.outcome, deviceHash: a.deviceHash, codeHash: d.outcome === "allowed" ? hashCode(code) : null });
    if (d.outcome !== "allowed") return { result: d.outcome, notify: d.notify };
    L.lastCode = code;
    L.openedSession = newSessionCode();
    return { result: "allowed", notify: d.notify, session: L.openedSession };
  };
  for (const a of sc.actions) {
    if (a.step === "open") steps.push(open(main, a.recipient_id === "correct", a.otp, a.device));
    else if (a.step === "download") {
      const d = decideDownload(main.link, main.openedSession !== null, b.now);
      steps.push({ result: d.outcome === "download" ? "allowed:watermarked_copy_fingerprint_logged" : d.outcome, notify: d.notify });
    } else if (a.step === "kill") { main.link.tokenKilled = true; steps.push({ result: "killed", notify: null }); }
    else if (a.step === "revoke") { main.link.shareRevoked = true; steps.push({ result: "revoked", notify: null }); }
    else if (a.step === "reshare") { other = newLink(); steps.push({ result: "new_share_active", notify: null }); }
    else if (a.step === "open_other_share") { other ??= newLink(); steps.push(open(other, true, "fresh", "A")); }
  }
  // Leak trace: the watermark of the SECOND opening, as text read off a screenshot.
  const opened = steps.map((x, i) => ({ i, session: x.session ?? null, recipientCode: rec.recipient_code })).filter((x) => x.session);
  const second = opened[1];
  const leak = second ? matchLeak(watermarkLabel({ name: rec.name, recipientCode: rec.recipient_code, time: b.today, session: second.session! }), opened) : { matches: [] };
  return { steps, leakResolvesTo: leak.matches.length === 1 ? leak.matches[0].i + 1 : null };
}

/** The showcase's share scenario by its role name. */
export function replayShare(b: Bench, role: string) {
  const prefix = [...b.docs.keys()][0].split(":").slice(0, 2).join(":");
  return replayScenario(b, b.data.scenarios.find((x) => x.ref === `${prefix}:${role}`)!);
}

export function checkShowcase(b: Bench): ConflictCheck[] {
  const prefix = [...b.docs.keys()][0].split(":").slice(0, 2).join(":");
  const r = (role: string) => `${prefix}:${role}`;
  const d = (role: string) => b.docs.get(r(role))!;
  const all = [...b.docs.values()];
  const ctx = contextFor(all, b.today);
  const scan = d("marksheet");
  const low = reviewHints(scan).map((h) => h.field);
  const misread = (b.labels.conflicts?.find((c) => c.id === 7)?.expected.misread_fields as string[]) ?? [];
  const v = (role: string, cond: Record<string, unknown> = {}) => verifyDoc(d(role), b.issuer, b.now, cond);
  const req = b.data.requests.find((q) => q.ref === r("scholarship_request"))!;
  const rq = checkRequest(req, b.packs);
  const withoutHidden = all.map((x) => (x.id === r("letter") ? { ...x, hidden_text: null } : x));
  const cardsSame = JSON.stringify(getReady("scholarship", ctx, b.packs).cards) === JSON.stringify(getReady("scholarship", contextFor(withoutHidden, b.today), b.packs).cards);

  const checks: [number, () => [boolean | null, string]][] = [
    [1, () => { const p = candidatePairs([d("id"), d("degree")])[0]; return [p.verdict !== "unlikely", `${p.verdict} ${p.score}: ${p.explanations.join("; ")}`]; }],
    [2, () => { const m = matchNames(scan.fields.name, d("degree").fields.name); return [m.verdict !== "unlikely" && m.explanations.some((x) => x.includes("initial")), `${m.verdict}: ${m.explanations.join("; ")}`]; }],
    [3, () => { const m = matchNames(scan.fields.name_te, d("degree").fields.name); return [m.verdict !== "unlikely", `${m.verdict} ${m.score}: ${m.explanations.join("; ")}`]; }],
    [4, () => { const m = matchNames(d("letter").fields.subject_name, d("degree").fields.name); return [m.explanations.includes("same words in a different order"), `${m.verdict}: ${m.explanations.join("; ")}`]; }],
    [5, () => { const o = notExpiredFor(d("income"), ctx); return [o.status === "fail" && o.detail?.daysExpired === 9, o.reason]; }],
    [6, () => { const below = Object.entries(scan.ocr_confidence ?? {}).filter(([, c]) => c < LOW_CONFIDENCE).map(([k]) => k); return [below.length > 0, `below ${LOW_CONFIDENCE}: ${below.join(", ") || "none"}`]; }],
    [7, () => [misread.every((f) => low.includes(f)), `misread ${misread.join(", ")}; flagged ${low.join(", ")} (correction screen = Phase 3)`]],
    [8, () => { const o = v("degree_copy"); return [o.state === "tamper_flagged" && sameSet(o.mismatchedFields, ["cgpa"]), o.reason]; }],
    [9, () => { const p = findDuplicates([d("degree"), d("degree_rescan")]); return [p.some((x) => x.kind === "rescan"), p.map((x) => x.kind).join(",")]; }],
    [10, () => { const o = v("provisional"); return [o.state === "superseded", o.reason]; }],
    [11, () => { const s = scanDocument(d("letter")); return [s.suspected && cardsSame, `${s.hits.join("; ")}; assistant cards unchanged: ${cardsSame}`]; }],
    [12, () => [rq.flagged && rq.extra.includes("id_card.id_number") && rq.alternatives["id_card.id_number"] === "id_card.id_number_last4", rq.reasons.join(" ")]],
    [13, () => { const c = dobConsistency([d("id"), d("school")]); return [c.consistent === true, c.reason]; }],
    [14, () => { const o = v("degree", { issuer_down: true }); return [o.state === "unverifiable" && !!o.retry?.nextRetryAt, o.reason]; }],
    [15, () => { const r = replayShare(b, "job_share"); const s2 = r.steps[1]; return [s2?.result === "allowed" && s2.notify === "new_device" && r.leakResolvesTo === 2, `step 2: ${s2?.result}, notify ${s2?.notify}; leak trace -> step ${r.leakResolvesTo}`]; }],
    [16, () => { const r = replayShare(b, "job_share"); const n = r.steps.map((x) => x.notify); return [r.steps[2]?.result === "denied:wrong_recipient" && r.steps[4]?.result === "denied:killed" && n.includes("wrong_recipient_attempt") && n.includes("killed_link_attempt"), r.steps.map((x, i) => `${i + 1}:${x.result}${x.notify ? `(${x.notify})` : ""}`).join(" ")]; }],
    [17, () => { const o = v("income"); return [o.state === "unverifiable" && o.signatureValid === false, o.reason]; }],
  ];
  return checks.map(([id, f]) => { const [detected, evidence] = f(); return { id, title: b.labels.conflicts?.find((c) => c.id === id)?.title ?? "", detected, evidence }; });
}
