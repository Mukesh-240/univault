/**
 * STEP TRAILS — "what just happened, step by step", built ONLY from the real result of an action.
 *
 * Plain-English picture: after the system does some work (check a document, share, issue, stop a link …) the screen
 * shows a short numbered list of the internal steps that really ran, each marked done / skipped / failed / waiting,
 * with its evidence (a ledger line number, a time, a code) and a one-line "why we do this".
 *
 * Every builder below takes the result object the server returned (or the ledger lines it wrote) and turns it into
 * steps. Nothing here is canned: a different result gives different steps. Nothing here looks at who the person is,
 * at a serial number, or at whether data is synthetic. No sensitive value (a name, a date of birth, a link, a code
 * someone typed) is ever put into a step; only counts, field NAMES, times, ids and ledger line numbers.
 * The words live in the locale files under `trail.<flow>.<step>.*` (English and Telugu).
 */
import type { VerifyOutcome } from "./verify";

export type StepStatus = "done" | "skipped" | "failed" | "waiting";

export interface TrailStep {
  /** i18n key of the sentence (e.g. "trail.verify.sig.ok"). */
  text: string;
  /** i18n key of the one-line "why we do this". */
  why: string;
  status: StepStatus;
  vars?: Record<string, string | number>;
  /** Proof the person can follow: a ledger line, a time, an id. Never a sensitive value. */
  evidence?: { kind: "ledger" | "time" | "code" | "count"; value: string; href?: string };
}

/** A ledger line written by the action (number + kind), as the server returned it. */
export interface LedgerRef { seq: number; kind: string }

const step = (flow: string, id: string, variant: string, status: StepStatus, extra: Partial<TrailStep> = {}): TrailStep =>
  ({ text: `trail.${flow}.${id}.${variant}`, why: `trail.${flow}.${id}.why`, status, ...extra });
const ledgerEvidence = (seq: number) => ({ kind: "ledger" as const, value: String(seq), href: "/ledger" });
const hhmm = (iso: string) => iso.slice(11, 16);

/* ───────── 4 Verify / re-check ───────── */
export function verifyTrail(o: VerifyOutcome, ledgerSeq?: number): TrailStep[] {
  const reached = o.signatureValid !== undefined || o.state !== "unverifiable";
  const steps: TrailStep[] = [];
  // 1. What was compared: the stored file's fingerprint (digital) or the text the person confirmed (scan).
  steps.push(o.method === "fields" ? step("verify", "input", "fields", "done") : step("verify", "input", "hash", "done"));
  // 2. Was the issuer's answer genuine?
  if (!reached) steps.push(step("verify", "sig", "skipped", "skipped"));
  else if (o.signatureValid === false) steps.push(step("verify", "sig", "bad", "failed"));
  else steps.push(step("verify", "sig", "ok", "done", o.registryVersion ? { vars: { v: o.registryVersion } } : {}));
  // 3. Field by field.
  if (!reached || o.signatureValid === false) steps.push(step("verify", "fields", "skipped", "skipped"));
  else if (o.mismatchedFields.length) steps.push(step("verify", "fields", "differ", "failed", { vars: { n: o.mismatchedFields.length, fields: o.mismatchedFields.join(", ") } }));
  else steps.push(step("verify", "fields", "match", "done"));
  // 4. The record's current status at the issuer (or the retry schedule when it did not answer).
  if (!reached) {
    const r = o.retry;
    if (r && !r.exhausted && r.nextRetryAt) steps.push(step("verify", "status", "retrying", "waiting", { vars: { time: hhmm(r.nextRetryAt), n: r.attemptsMade + 1 }, evidence: { kind: "time", value: hhmm(o.checkedAt) } }));
    else steps.push(step("verify", "status", "noanswer", "failed", { evidence: { kind: "time", value: hhmm(o.checkedAt) } }));
  } else {
    const variant = o.state === "revoked" ? "revoked" : o.state === "superseded" ? "superseded" : "active";
    steps.push(step("verify", "status", variant, variant === "active" ? "done" : "failed", { vars: { time: hhmm(o.checkedAt) }, evidence: { kind: "time", value: hhmm(o.checkedAt) } }));
    if (o.freshness === "stale") steps.push(step("verify", "fresh", "stale", "waiting"));
  }
  // 5. Recorded.
  steps.push(ledgerSeq ? step("verify", "ledger", "line", "done", { vars: { seq: ledgerSeq }, evidence: ledgerEvidence(ledgerSeq) }) : step("verify", "ledger", "earlier", "done"));
  return steps;
}

/* ───────── 1 Share (owner) ───────── */
export interface ShareReceiptFacts { verified: { title: string; state: string }[]; fields: string[]; recipient: { code: string }; ledger_ok?: boolean; ledger?: LedgerRef[] }
export function shareTrail(r: ShareReceiptFacts): TrailStep[] {
  const ok = r.verified.filter((v) => v.state === "verified").length;
  const lines = [...(r.ledger ?? [])].sort((a, b) => a.seq - b.seq);
  const tokenLine = lines.find((l) => l.kind === "token.issued");
  return [
    step("share", "reverify", ok === r.verified.length ? "ok" : "some", ok === r.verified.length ? "done" : "failed", { vars: { n: r.verified.length, ok } }),
    step("share", "attest", "built", "done", { vars: { n: r.fields.length }, evidence: { kind: "count", value: String(r.fields.length) } }),
    step("share", "link", "made", "done", tokenLine ? { evidence: ledgerEvidence(tokenLine.seq) } : {}),
    r.ledger_ok === false ? step("share", "ledger", "broken", "failed")
      : lines.length ? step("share", "ledger", "lines", "done", { vars: { n: lines.length, first: lines[0].seq, last: lines[lines.length - 1].seq }, evidence: ledgerEvidence(lines[lines.length - 1].seq) })
      : step("share", "ledger", "unknown", "waiting"),
    step("share", "inbox", "listed", "done", { vars: { code: r.recipient.code }, evidence: { kind: "code", value: r.recipient.code } }),
  ];
}

/* ───────── 3 Issue a document (issuer) ───────── */
export interface IssueFacts { serial: string; fieldCount: number; salted: boolean; ledgerSeq?: number; sha256: string }
export function issueTrail(f: IssueFacts): TrailStep[] {
  return [
    step("issue", "authority", "ok", "done"),
    step("issue", "canon", "done", "done", { vars: { n: f.fieldCount } }),
    step("issue", "salt", f.salted ? "done" : "none", f.salted ? "done" : "skipped", { vars: { n: f.fieldCount } }),
    step("issue", "sign", "done", "done"),
    step("issue", "registry", "done", "done", { vars: { serial: f.serial }, evidence: { kind: "code", value: f.serial } }),
    step("issue", "deliver", "done", "done", { vars: { fp: f.sha256.slice(0, 12) }, evidence: { kind: "code", value: f.sha256.slice(0, 12) } }),
    f.ledgerSeq ? step("issue", "ledger", "line", "done", { vars: { seq: f.ledgerSeq }, evidence: ledgerEvidence(f.ledgerSeq) }) : step("issue", "ledger", "unknown", "waiting"),
  ];
}

/* ───────── 5 Stop sharing (kill a link, a recipient, or everything) ───────── */
export interface KillFacts { scope: "link" | "user" | "all"; killed: number; ledger?: LedgerRef[]; test?: { outcome: string } | null }
export function killTrail(k: KillFacts): TrailStep[] {
  const lines = [...(k.ledger ?? [])].sort((a, b) => a.seq - b.seq);
  const steps = [
    step("kill", "tokens", k.killed > 0 ? "done" : "none", k.killed > 0 ? "done" : "skipped", { vars: { n: k.killed } }),
    lines.length ? step("kill", "ledger", "lines", "done", { vars: { n: lines.length, last: lines[lines.length - 1].seq }, evidence: ledgerEvidence(lines[lines.length - 1].seq) }) : step("kill", "ledger", "unknown", "waiting"),
  ];
  if (k.test) steps.push(step("kill", "test", k.test.outcome.startsWith("denied") ? "denied" : "open", k.test.outcome.startsWith("denied") ? "done" : "failed", { vars: { outcome: k.test.outcome } }));
  else steps.push(step("kill", "test", "notyet", "waiting"));
  steps.push(step("kill", "notice", "done", "done"));
  return steps;
}

/* ───────── 2 Open a shared link (receiver) ───────── */
/** `outcome`: "gate" (the page opened), "code_issued" (a code was shown), "locked", or a final access outcome. */
export function openTrail(outcome: string, attemptsLeft?: number): TrailStep[] {
  const dead = ["denied:revoked", "denied:killed", "denied:expired", "denied:unknown_link", "denied:max_views"];
  const steps: TrailStep[] = [step("open", "link", dead.includes(outcome) ? "dead" : "ok", dead.includes(outcome) ? "failed" : "done")];
  if (dead.includes(outcome)) return [...steps, step("open", "id", "skipped", "skipped"), step("open", "code", "skipped", "skipped"), step("open", "view", "no", "skipped")];
  const idBad = outcome === "denied:wrong_recipient" || outcome === "denied:unintended_account";
  steps.push(step("open", "id", outcome === "denied:unintended_account" ? "forwarded" : idBad ? "bad" : outcome === "gate" ? "ask" : "ok", idBad ? "failed" : outcome === "gate" ? "waiting" : "done"));
  if (idBad || outcome === "gate") return [...steps, step("open", "code", "skipped", "skipped"), step("open", "view", "no", "skipped")];
  if (outcome === "code_issued") return [...steps, step("open", "code", "sent", "waiting"), step("open", "view", "no", "waiting")];
  if (outcome === "locked") return [...steps, step("open", "code", "locked", "failed"), step("open", "view", "no", "skipped")];
  if (outcome === "denied:wrong_code" || outcome === "denied:otp_reused" || outcome === "denied:otp_expired")
    return [...steps, step("open", "code", "wrong", "failed", { vars: { left: attemptsLeft ?? 0 } }), step("open", "view", "no", "skipped")];
  return [...steps, step("open", "code", "ok", "done"), step("open", "view", "yes", outcome === "allowed" ? "done" : "skipped")];
}

/* ───────── 6 Request and eligibility ───────── */
export interface CriterionFacts { label: string; result: "met" | "not_met" | "unknown"; reason: string; evidence?: string | null }
export function eligibilityTrail(criteria: CriterionFacts[], ledgerSeq?: number): TrailStep[] {
  return [
    step("elig", "consent", "done", "done"),
    ...criteria.map((c) => step("elig", "criterion", c.result, c.result === "met" ? "done" : c.result === "not_met" ? "failed" : "waiting",
      { vars: { label: c.label, reason: c.reason, doc: c.evidence ?? "-" } })),
    step("elig", "noaccess", "done", "done"),
    ledgerSeq ? step("elig", "ledger", "line", "done", { vars: { seq: ledgerSeq }, evidence: ledgerEvidence(ledgerSeq) }) : step("elig", "ledger", "earlier", "done"),
  ];
}

/* ───────── 7 Sign-in ───────── */
export type SignInStage = "number" | "code" | "consent" | "in";
export function signInTrail(stage: SignInStage): TrailStep[] {
  const order: SignInStage[] = ["number", "code", "consent", "in"];
  const at = order.indexOf(stage);
  return order.map((id, i) => step("signin", id, i < at || stage === "in" ? "done" : i === at ? "now" : "next", i < at || stage === "in" ? "done" : "waiting"));
}

/* ───────── 8 Scan and fix, Same person?, Erase ───────── */
export function fixTrail(f: { field: string; confidence?: number; action: "confirmed" | "corrected" }): TrailStep[] {
  return [
    step("fix", "read", f.confidence !== undefined ? "sure" : "plain", "done", { vars: { field: f.field, pct: f.confidence !== undefined ? Math.round(f.confidence * 100) : 0 } }),
    step("fix", "change", f.action, "done", { vars: { field: f.field } }),
    step("fix", "kept", "done", "done"),
    step("fix", "recorded", "done", "done"),
  ];
}
export function namesTrail(d: { decision: "confirmed_same_person" | "rejected"; score: number }): TrailStep[] {
  return [
    step("names", "compared", "done", "done", { vars: { score: d.score.toFixed(2) } }),
    step("names", "decided", d.decision === "rejected" ? "different" : "same", "done"),
    step("names", "nomerge", "done", "done"),
    step("names", "recorded", "done", "done"),
  ];
}
export function eraseTrail(e: { sha256: string; ledgerSeq?: number }): TrailStep[] {
  return [
    step("erase", "content", "done", "done"),
    step("erase", "fingerprint", "kept", "done", { vars: { fp: e.sha256.slice(0, 12) }, evidence: { kind: "code", value: e.sha256.slice(0, 12) } }),
    step("erase", "copies", "cannot", "skipped"),
    e.ledgerSeq ? step("erase", "ledger", "line", "done", { vars: { seq: e.ledgerSeq }, evidence: ledgerEvidence(e.ledgerSeq) }) : step("erase", "ledger", "earlier", "done"),
  ];
}

/* ───────── 9 Leak trace ───────── */
export interface LeakFacts { found: boolean; recipientCode?: string | null; at?: string | null; session?: string | null }
export function leakTrail(l: LeakFacts): TrailStep[] {
  return [
    step("leak", "read", "done", "done"),
    l.found ? step("leak", "match", "found", "done", { vars: { code: l.recipientCode ?? "-", time: l.at ? hhmm(l.at) : "-", session: l.session ?? "-" }, evidence: { kind: "code", value: l.session ?? "-" } })
      : step("leak", "match", "none", "failed"),
    step("leak", "limit", "done", "done"),
  ];
}
