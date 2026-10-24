/**
 * VERIFY — the verification service's decision logic (spec F11, F12, F20).
 *
 * Plain-English picture:
 *   To check a document, UNIVAULT asks the (simulated) issuer for its record and then decides:
 *     verified        — it matches the issuer's signed record,
 *     tamper_flagged  — it doesn't match in named fields (worded neutrally),
 *     superseded      — the issuer replaced it (or published an updated version of it),
 *     revoked         — the issuer withdrew it,
 *     unverifiable    — the issuer couldn't be reached, had no record, or sent an untrustworthy reply.
 *
 *   Extra rules from the spec handled here:
 *   - Each attempt waits at most 8 seconds. If the issuer is unreachable, the screen says
 *     "Unverified: issuer unreachable at HH:MM, retrying" and retries happen 10 s, 30 s, 60 s and
 *     120 s after the first failure; after that a manual "Retry now" is offered.
 *   - A verification older than 24 hours is "stale" and must be redone before any share.
 *   - A scanned document can only be checked after the person has CONFIRMED its OCR text.
 *   - If the issuer published a newer version and this copy matches an older genuine version, we
 *     say "the issuer updated this record" (not "doesn't match"), and name the changed fields.
 *
 * This file only DECIDES. The API route (/api/verify) does the asking and the recording.
 */
import { explain, type Explanation } from "./explain";
import {
  entrySignatureValid, fieldHashes, ISSUER_ATTEMPT_TIMEOUT_MS, ISSUER_RETRY_DELAYS_MS, verifyAgainstIssuer,
  type RegistryEntry, type VerifyResult,
} from "./issuer";
import { fieldValue, type EngineContext, type VaultDoc } from "./vault";

/** Verification results older than this must be redone before sharing. */
export const STALE_AFTER_HOURS = 24;

/** What the issuer said: could we reach it, and its versions of the record (newest first). */
export interface IssuerReply { reachable: boolean; history: RegistryEntry[] }

/** Where we are in the "issuer unreachable" retry schedule. */
export interface RetryState { attemptsMade: number; firstFailureAt: string; nextRetryAt: string | null; exhausted: boolean; label: string }

/** The full verification outcome, ready to show (with its explanation) and to record. */
export interface VerifyOutcome extends VerifyResult {
  freshness: "fresh" | "stale";
  mustReverifyBeforeShare: boolean;
  issuerUpdate?: { matchesVersion: number; latestVersion: number; changedFields: string[] };
  retry?: RetryState;
  explanation: Explanation;
}

/** "HH:MM" of an ISO time (UTC). */
const hhmm = (iso: string) => iso.slice(11, 16);

/**
 * Ask the issuer, but never wait more than 8 seconds. A timeout or any error counts as "unreachable"
 * (never as "not verified" or "tampered").
 */
export async function lookupWithTimeout(call: (signal: AbortSignal) => Promise<IssuerReply>, ms = ISSUER_ATTEMPT_TIMEOUT_MS): Promise<IssuerReply> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const timedOut = new Promise<IssuerReply>((resolve) => ctrl.signal.addEventListener("abort", () => resolve({ reachable: false, history: [] })));
  try {
    return await Promise.race([call(ctrl.signal), timedOut]);
  } catch {
    return { reachable: false, history: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The retry schedule after the first failure: retries 10 s, 30 s, 60 s and 120 s after it
 * (about 2 minutes in total), then "exhausted" -> offer a manual "Retry now".
 */
export function retryState(firstFailureAt: string, attemptsMade: number, now: Date): RetryState {
  const exhausted = attemptsMade >= ISSUER_RETRY_DELAYS_MS.length;
  const due = exhausted ? null : new Date(Date.parse(firstFailureAt) + ISSUER_RETRY_DELAYS_MS[attemptsMade]).toISOString();
  const label = exhausted
    ? `Unverified: issuer unreachable at ${hhmm(firstFailureAt)} UTC. Automatic retries finished; use "Retry now".`
    : `Unverified: issuer unreachable at ${hhmm(firstFailureAt)} UTC, retrying.`;
  // If a retry is already overdue (e.g. the page was closed), it is due "now".
  const nextRetryAt = due && due < now.toISOString() ? now.toISOString() : due;
  return { attemptsMade, firstFailureAt, nextRetryAt, exhausted, label };
}

/** Is a verification done at `checkedAt` still fresh at `now`? */
export function freshnessOf(checkedAt: string, now: Date): "fresh" | "stale" {
  return now.getTime() - Date.parse(checkedAt) > STALE_AFTER_HOURS * 3_600_000 ? "stale" : "fresh";
}

/**
 * Which values to send for checking. Digital originals: their fields. Scans: only once EVERY field
 * has been confirmed (or corrected) by the person; otherwise we list the unconfirmed fields.
 */
export function fieldsToVerify(doc: VaultDoc, ctx: Pick<EngineContext, "confirmedFields">):
  { ok: true; kind: "digital" | "scan"; fields: Record<string, string> } | { ok: false; unconfirmed: string[] } {
  if (doc.capture === "digital") return { ok: true, kind: "digital", fields: doc.fields };
  const fields: Record<string, string> = {};
  const unconfirmed: string[] = [];
  for (const k of Object.keys(doc.fields)) {
    const v = fieldValue(doc, k, ctx);
    if (!v.trusted || v.value === undefined) unconfirmed.push(k); else fields[k] = v.value;
  }
  return unconfirmed.length ? { ok: false, unconfirmed } : { ok: true, kind: "scan", fields };
}

/** Same set of fields with the same fingerprints? */
const sameFieldHashes = (mine: Record<string, string>, theirs: Record<string, string>) =>
  Object.keys(mine).length === Object.keys(theirs).length && Object.keys(theirs).every((k) => mine[k] === theirs[k]);

/**
 * Decide the verification outcome from the issuer's reply.
 * `failure` carries the retry bookkeeping when earlier attempts already failed.
 */
export function decideVerification(
  fields: Record<string, string>, kind: "digital" | "scan", reply: IssuerReply, issuerPubB64: string, now: Date,
  failure?: { firstFailureAt: string; attemptsMade: number },
  salts?: Record<string, string> | null,
): VerifyOutcome {
  const latest = reply.history[0] ?? null;
  const base = verifyAgainstIssuer(fields, kind, { reachable: reply.reachable, entry: latest }, issuerPubB64, now, salts);
  let result: VerifyResult = base;
  let issuerUpdate: VerifyOutcome["issuerUpdate"];

  // The issuer published a newer version: does this copy match an older, genuinely signed one?
  if (base.state === "tamper_flagged" && latest && reply.history.length > 1) {
    const older = reply.history.slice(1).find((e) => entrySignatureValid(e, issuerPubB64) && sameFieldHashes(fieldHashes(fields, e.field_hashes?.__salted === "1" ? salts : null), e.field_hashes ?? {}));
    if (older) {
      issuerUpdate = { matchesVersion: older.version, latestVersion: latest.version, changedFields: base.mismatchedFields };
      result = { ...base, state: "superseded", mismatchedFields: [],
        reason: `The issuer has published an updated record (version ${latest.version}). Your copy matches the earlier version ${older.version}; changed: ${base.mismatchedFields.join(", ")}. Please get the updated document.` };
    }
  }

  const retry = result.state === "unverifiable" && !reply.reachable
    ? retryState(failure?.firstFailureAt ?? result.checkedAt, failure?.attemptsMade ?? 0, now) : undefined;
  const reason = retry ? retry.label : result.reason;
  const evidence = result.state === "verified" ? (result.method === "hash" ? "strong" : "weaker") : "none";
  return {
    ...result, reason, freshness: "fresh", mustReverifyBeforeShare: result.state !== "verified", issuerUpdate, retry,
    explanation: explain({
      reason, confidence: { kind: "evidence", value: evidence },
      source: { name: "SIMULATED ISSUER registry", version: result.registryVersion, checkedAt: result.checkedAt, freshness: "fresh" },
      documentIds: [],
    }),
  };
}

/** Re-label an earlier outcome when it has gone stale (older than 24 h): it must be re-verified before sharing. */
export function withFreshness(o: VerifyOutcome, now: Date): VerifyOutcome {
  if (freshnessOf(o.checkedAt, now) === "fresh") return o;
  const hours = Math.floor((now.getTime() - Date.parse(o.checkedAt)) / 3_600_000);
  const reason = `${o.reason} (stale: last verified ${hours} h ago; will be re-checked before any share)`;
  return { ...o, freshness: "stale", mustReverifyBeforeShare: true, reason, explanation: { ...o.explanation, reason, source: { ...o.explanation.source, freshness: "stale" } } };
}
