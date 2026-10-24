/**
 * RULES — "am I ready to apply for this purpose?", answered rule by rule.
 *
 * Plain-English picture:
 *   Each purpose (job, scholarship, overseas credential check) has a RULE PACK: a JSON file in
 *   src/rules/ listing what is needed, e.g. "income certificate has not expired". Adding a new
 *   recipient means adding a JSON file — no code change. Rule packs are demo rules written by us,
 *   NOT official requirements, and every result says so via its source.
 *
 *   Every rule answers with one of THREE values:
 *     pass    — the data clearly satisfies it,
 *     fail    — the data clearly does not (e.g. "expired 9 days ago"),
 *     unknown — we can't tell yet (e.g. the date was read by OCR and you haven't confirmed it).
 *   Unknown is never silently treated as pass.
 *
 *   Overall readiness for a purpose:  all pass -> READY;  any fail -> NOT READY;
 *   otherwise -> NEEDS CONFIRMATION.
 *
 * The six building blocks ("predicates") a rule can use:
 *   doc_exists, verified, not_expired, name_consistent, scan_confirmed, age_at_least.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ageOn, daysBetween, parseDate } from "./dates";
import { explain, type Explanation, type Tri } from "./explain";
import { matchNames, nameTokens } from "./names";
import { reviewHints } from "./ocr";
import { fieldValue, type EngineContext, type VaultDoc } from "./vault";

// ─────────────────────────── Rule pack format (checked when loaded) ───────────────────────────

export const PREDICATES = ["doc_exists", "verified", "not_expired", "name_consistent", "scan_confirmed", "age_at_least"] as const;
const RuleSpec = z.object({ id: z.string(), label: z.string(), predicate: z.enum(PREDICATES), args: z.record(z.string(), z.unknown()) });
export const RulePack = z.object({
  id: z.string(), purpose: z.string(), title: z.string(), disclaimer: z.string(), source: z.string(), lastReviewed: z.string(),
  rules: z.array(RuleSpec).min(1),
  allowed_fields: z.array(z.string()),
  alternatives: z.record(z.string(), z.string()).default({}),
});
export type RulePack = z.infer<typeof RulePack>;
export type RuleSpec = z.infer<typeof RuleSpec>;

/** Read every rule pack in src/rules/ (sorted by file name). A malformed pack stops with a clear error. */
export function loadPacks(dir = join(process.cwd(), "src", "rules")): RulePack[] {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    try { return RulePack.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))); }
    catch (e) { throw new Error(`Rule pack ${f} is invalid: ${e instanceof Error ? e.message : e}`); }
  });
}

// ─────────────────────────── Results ───────────────────────────

/** One rule's answer, with everything the <Explain> component needs. */
export interface RuleResult {
  ruleId: string; label: string; predicate: RuleSpec["predicate"];
  status: Tri; reason: string; documentIds: string[]; confidence: number;
  source: string; lastReviewed: string;
  detail?: Record<string, unknown>;
  explanation: Explanation;
}
export interface Readiness { packId: string; title: string; disclaimer: string; overall: "ready" | "not_ready" | "needs_confirmation"; results: RuleResult[] }

/** What a predicate returns before it is wrapped into a RuleResult. */
export interface Outcome { status: Tri; reason: string; documentIds: string[]; confidence: number; detail?: Record<string, unknown> }

/** Three-valued combination for "all of these must hold": any fail -> fail; all pass -> pass; else unknown. */
export function combineAll(statuses: Tri[]): Tri {
  if (statuses.includes("fail")) return "fail";
  return statuses.every((s) => s === "pass") ? "pass" : "unknown";
}

const RANK: Record<Tri, number> = { pass: 2, unknown: 1, fail: 0 };
/** Several documents of the same type: the best answer counts (one valid certificate is enough). */
const best = (outs: Outcome[]): Outcome => [...outs].sort((a, b) => RANK[b.status] - RANK[a.status])[0];
const ofType = (ctx: EngineContext, t: string) => ctx.docs.filter((d) => d.doc_type === t);
const missing = (t: string): Outcome => ({ status: "fail", reason: `No ${t.replace(/_/g, " ")} in the vault.`, documentIds: [], confidence: 1 });
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

// ─────────────────────────── The six predicates ───────────────────────────

/** doc_exists: is there at least one document of this type? */
function docExists(ctx: EngineContext, a: Record<string, unknown>): Outcome {
  const docs = ofType(ctx, str(a.doc_type));
  return docs.length ? { status: "pass", reason: `${docs.length} found.`, documentIds: docs.map((d) => d.id), confidence: 1 } : missing(str(a.doc_type));
}

/** verified: has the issuer confirmed this document (recently)? */
function verified(ctx: EngineContext, a: Record<string, unknown>): Outcome {
  const docs = ofType(ctx, str(a.doc_type));
  if (!docs.length) return missing(str(a.doc_type));
  return best(docs.map((d): Outcome => {
    const v = ctx.verification[d.id];
    if (!v) return { status: "unknown", reason: "Not checked with the issuer yet.", documentIds: [d.id], confidence: 0 };
    if (v.state === "verified" && v.freshness === "fresh") return { status: "pass", reason: v.reason, documentIds: [d.id], confidence: v.method === "hash" ? 1 : 0.8 };
    if (v.state === "verified") return { status: "unknown", reason: v.reason, documentIds: [d.id], confidence: 0.5 };
    if (v.state === "unverifiable") return { status: "unknown", reason: v.reason, documentIds: [d.id], confidence: 0 };
    return { status: "fail", reason: v.reason, documentIds: [d.id], confidence: 1, detail: { state: v.state, mismatchedFields: v.mismatchedFields } };
  }));
}

/**
 * not_expired: is the expiry date today or later? A document dated AFTER today is not valid yet.
 * A document type with no expiry field (e.g. a degree) passes.
 */
export function notExpiredFor(d: VaultDoc, ctx: Pick<EngineContext, "today" | "confirmedFields">, field = "valid_until", issuedField = "issued_on"): Outcome {
  const until = fieldValue(d, field, ctx);
  const issued = fieldValue(d, issuedField, ctx);
  if (until.value === undefined) return { status: "pass", reason: "No expiry date on this document.", documentIds: [d.id], confidence: 1 };
  if (!until.trusted || (issued.value !== undefined && !issued.trusted))
    return { status: "unknown", reason: "The dates were read by OCR and are not confirmed yet.", documentIds: [d.id], confidence: 0 };
  const untilIso = parseDate(until.value);
  if (!untilIso) return { status: "unknown", reason: `Can't read the expiry date "${until.value}".`, documentIds: [d.id], confidence: 0 };
  const issuedIso = parseDate(issued.value);
  if (issuedIso && issuedIso > ctx.today)
    return { status: "fail", reason: `Not valid yet: the issue date ${issuedIso} is after today (${ctx.today}).`, documentIds: [d.id], confidence: 1, detail: { notYetValid: true } };
  const late = daysBetween(untilIso, ctx.today);
  if (late > 0) return { status: "fail", reason: `Expired ${late} day${late === 1 ? "" : "s"} ago (valid until ${untilIso}).`, documentIds: [d.id], confidence: 1, detail: { daysExpired: late } };
  const left = -late;
  return { status: "pass", reason: left === 0 ? `Valid until today (${untilIso}).` : `Valid until ${untilIso} (${left} day${left === 1 ? "" : "s"} left).`, documentIds: [d.id], confidence: 1, detail: { daysLeft: left } };
}
function notExpired(ctx: EngineContext, a: Record<string, unknown>): Outcome {
  const docs = ofType(ctx, str(a.doc_type));
  return docs.length ? best(docs.map((d) => notExpiredFor(d, ctx, str(a.field, "valid_until"), str(a.issued_field, "issued_on")))) : missing(str(a.doc_type));
}

/**
 * name_consistent: do the names on these documents belong to the same person?
 *   identical (after tidying) or confirmed by you -> pass;  clearly different or rejected by you -> fail;
 *   probably the same but not confirmed, or read by unconfirmed OCR -> unknown (we never merge on our own).
 */
function nameConsistent(ctx: EngineContext, a: Record<string, unknown>): Outcome {
  const types = Array.isArray(a.doc_types) ? (a.doc_types as string[]) : [];
  const field = str(a.field, "name");
  const docs = ctx.docs.filter((d) => types.includes(d.doc_type) && d.fields[field] !== undefined);
  if (docs.length < 2) return { status: "unknown", reason: "Fewer than two documents with a name to compare.", documentIds: docs.map((d) => d.id), confidence: 0 };
  const pairs: Outcome[] = [];
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const [x, y] = [docs[i], docs[j]];
    const ids = [x.id, y.id];
    const link = ctx.links.find((l) => (l.a === x.id && l.b === y.id) || (l.a === y.id && l.b === x.id));
    if (link) { pairs.push({ status: link.decision === "confirmed_same_person" ? "pass" : "fail", reason: link.decision === "confirmed_same_person" ? "You confirmed these are the same person." : "You marked these as different people.", documentIds: ids, confidence: 1 }); continue; }
    const nx = fieldValue(x, field, ctx), ny = fieldValue(y, field, ctx);
    if (!nx.trusted || !ny.trusted) { pairs.push({ status: "unknown", reason: "A name was read by OCR and is not confirmed yet.", documentIds: ids, confidence: 0 }); continue; }
    if (nameTokens(nx.value!).join(" ") === nameTokens(ny.value!).join(" ")) { pairs.push({ status: "pass", reason: "Names are identical.", documentIds: ids, confidence: 1 }); continue; }
    const m = matchNames(nx.value!, ny.value!);
    pairs.push(m.verdict === "unlikely"
      ? { status: "fail", reason: `Names look like different people: ${m.explanations.join("; ")}.`, documentIds: ids, confidence: 1 - m.score }
      : { status: "unknown", reason: `Probably the same person (${m.score.toFixed(2)}): ${m.explanations.join("; ")}. Please confirm the link.`, documentIds: ids, confidence: m.score });
  }
  const status = combineAll(pairs.map((p) => p.status));
  const shown = pairs.filter((p) => p.status === status);
  return { status, reason: shown.map((p) => p.reason).join(" "), documentIds: [...new Set(shown.flatMap((p) => p.documentIds))], confidence: Math.min(...pairs.map((p) => p.confidence)) };
}

export { LOW_CONFIDENCE } from "./ocr";

/** scan_confirmed: has the person confirmed every field the OCR read from this scan? */
function scanConfirmed(ctx: EngineContext, a: Record<string, unknown>): Outcome {
  const docs = ofType(ctx, str(a.doc_type));
  if (!docs.length) return missing(str(a.doc_type));
  return best(docs.map((d): Outcome => {
    if (d.capture === "digital") return { status: "pass", reason: "Digital original: nothing to confirm.", documentIds: [d.id], confidence: 1 };
    const unconfirmed = Object.keys(d.fields).filter((k) => !fieldValue(d, k, ctx).trusted);
    if (!unconfirmed.length) return { status: "pass", reason: "You confirmed every field read from this scan.", documentIds: [d.id], confidence: 1 };
    const low = reviewHints(d).map((h) => h.field).filter((k) => unconfirmed.includes(k));
    return { status: "unknown", reason: `${unconfirmed.length} field(s) read by OCR are not confirmed yet${low.length ? `; please check these first: ${low.join(", ")}` : ""}.`,
      documentIds: [d.id], confidence: 0, detail: { unconfirmed, lowConfidence: low } };
  }));
}

/** age_at_least: is the person at least N years old today, according to the date of birth on a document? */
export function ageAtLeastFor(d: VaultDoc, ctx: Pick<EngineContext, "today" | "confirmedFields">, years: number, field = "dob"): Outcome {
  const v = fieldValue(d, field, ctx);
  if (v.value === undefined) return { status: "unknown", reason: "No date of birth on this document.", documentIds: [d.id], confidence: 0 };
  if (!v.trusted) return { status: "unknown", reason: "The date of birth was read by OCR and is not confirmed yet.", documentIds: [d.id], confidence: 0 };
  const dob = parseDate(v.value);
  if (!dob) return { status: "unknown", reason: `Can't read the date of birth "${v.value}".`, documentIds: [d.id], confidence: 0 };
  const age = ageOn(dob, ctx.today);
  return age >= years
    ? { status: "pass", reason: `Age ${age} today (born ${dob}).`, documentIds: [d.id], confidence: 1, detail: { age } }
    : { status: "fail", reason: `Age ${age} today (born ${dob}); needs to be at least ${years}.`, documentIds: [d.id], confidence: 1, detail: { age } };
}
function ageAtLeast(ctx: EngineContext, a: Record<string, unknown>): Outcome {
  const docs = ofType(ctx, str(a.doc_type, "id_card"));
  const years = typeof a.years === "number" ? a.years : 18;
  return docs.length ? best(docs.map((d) => ageAtLeastFor(d, ctx, years, str(a.field, "dob")))) : missing(str(a.doc_type, "id_card"));
}

const IMPL: Record<RuleSpec["predicate"], (ctx: EngineContext, args: Record<string, unknown>) => Outcome> = {
  doc_exists: docExists, verified, not_expired: notExpired, name_consistent: nameConsistent, scan_confirmed: scanConfirmed, age_at_least: ageAtLeast,
};

/** Evaluate every rule of a pack against a vault, and the overall readiness. */
export function evaluatePack(pack: RulePack, ctx: EngineContext): Readiness {
  const results = pack.rules.map((r): RuleResult => {
    const o = IMPL[r.predicate](ctx, r.args);
    return {
      ruleId: r.id, label: r.label, predicate: r.predicate, ...o, source: pack.source, lastReviewed: pack.lastReviewed,
      explanation: explain({ reason: o.reason, confidence: { kind: "tri", value: o.status }, source: { name: `${pack.source} (${pack.disclaimer})`, version: pack.lastReviewed, freshness: "n/a" }, documentIds: o.documentIds }),
    };
  });
  const all = combineAll(results.map((r) => r.status));
  return { packId: pack.id, title: pack.title, disclaimer: pack.disclaimer, overall: all === "pass" ? "ready" : all === "fail" ? "not_ready" : "needs_confirmation", results };
}
