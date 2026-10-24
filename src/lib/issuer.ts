import { canon, sha256, signText, verifyText } from "./crypto";

/**
 * ISSUER — checks a document against what the (SIMULATED) issuer has on record.
 *
 * Plain-English picture:
 *   An "issuer" is whoever created a document (a university, a revenue office...). Here the issuer
 *   is a simulation we built — no real government system is connected. For every document it
 *   keeps a "registry entry": the document's fingerprint, a fingerprint for EACH field (name, CGPA,
 *   ...), its status (active / superseded / revoked), and a digital SIGNATURE over all of that.
 *
 *   verifyAgainstIssuer() walks through these checks, in order:
 *     1. Could we reach the issuer at all?        no  -> "unverifiable: issuer unreachable, retrying"
 *     2. Does it have a record for this serial?   no  -> "unverifiable: no record"
 *     3. Is the record's signature genuine?       no  -> "unverifiable: reply not trusted" (forgery)
 *     4. Has the issuer revoked or replaced it?   yes -> "revoked" / "superseded"
 *     5. Do the contents match?
 *          digital original: whole-document fingerprint equal -> "verified" (strongest evidence)
 *          scan (after the person confirms the OCR text): every field fingerprint equal -> "verified" (weaker)
 *          otherwise -> "doesn't match in <these fields>" — worded neutrally, never as an accusation.
 *   Per-field fingerprints are what let us say WHICH field differs, not just "something differs".
 *
 * The hashes and signatures are real cryptography; the issuer itself is a simulation.
 */

/** A document's data as field name -> value, e.g. { name: "...", cgpa: "8.41" }. */
export type Fields = Record<string, string | number>;

/** What the simulated issuer stores and sends back for one document (no raw values, only fingerprints). */
export interface RegistryEntry {
  serial: string;
  doc_type: string;
  issuer_name: string;
  record_hash: string;
  field_hashes: Record<string, string>;
  status: "active" | "superseded" | "revoked";
  superseded_by?: string | null;
  version: number;
  signature: string;
}

/** One fingerprint per field, computed from "fieldname=value" (spaces at the ends ignored). */
export const fieldHashes =(f: Fields): Record<string, string> =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, sha256(`${k}=${String(v).trim()}`)]));

/** One fingerprint for the whole record, exactly as written (so even a stray space changes it). */
export const recordHash =(f: Fields): string => sha256(canon(f));

// The exact text the issuer signs: every part of the entry except the signature itself, keys sorted.
const signedPayload =(e: Omit<RegistryEntry, "signature">) =>
  canon({ serial: e.serial, doc_type: e.doc_type, issuer_name: e.issuer_name, record_hash: e.record_hash,
    field_hashes: e.field_hashes, status: e.status, superseded_by: e.superseded_by ?? null, version: e.version });

/** Is this registry entry's signature genuine? (Used to trust older versions in an entry's history.) */
export function entrySignatureValid(e: RegistryEntry, issuerPubB64: string): boolean {
  const { signature, ...rest } = e;
  return verifyText(signedPayload(rest), signature, issuerPubB64);
}

/** The simulated issuer creating (and signing) a registry entry for a document's true fields. */
export function issueEntry(
  fields: Fields,
  meta: { serial: string; doc_type: string; issuer_name: string; status?: RegistryEntry["status"]; superseded_by?: string | null; version?: number },
  issuerPrivB64: string,
): RegistryEntry {
  const base = {
    serial: meta.serial, doc_type: meta.doc_type, issuer_name: meta.issuer_name,
    record_hash: recordHash(fields), field_hashes: fieldHashes(fields),
    status: meta.status ?? "active", superseded_by: meta.superseded_by ?? null, version: meta.version ?? 1,
  } as Omit<RegistryEntry, "signature">;
  return { ...base, signature: signText(signedPayload(base), issuerPrivB64) };
}

/**
 * The issuer changing the STATUS of a record it already issued (revoke it, or mark it replaced): the same
 * fingerprints, the NEXT version number, a fresh signature. The old version stays in the registry (append-only), so
 * the history of what the issuer said, and when, is never lost. Verification (below) is untouched: it simply reads the
 * newest signed version, as it always did.
 */
export function resignEntry(prev: RegistryEntry, change: { status: RegistryEntry["status"]; superseded_by?: string | null }, issuerPrivB64: string): RegistryEntry {
  const base = {
    serial: prev.serial, doc_type: prev.doc_type, issuer_name: prev.issuer_name, record_hash: prev.record_hash, field_hashes: prev.field_hashes,
    status: change.status, superseded_by: change.superseded_by ?? null, version: prev.version + 1,
  } as Omit<RegistryEntry, "signature">;
  return { ...base, signature: signText(signedPayload(base), issuerPrivB64) };
}

/** The possible outcomes of a verification, and the full result shown (with reasons) to the person. */
export type VerifyState ="verified" | "unverifiable" | "tamper_flagged" | "superseded" | "revoked";
export interface VerifyResult {
  state: VerifyState;
  method: "hash" | "fields" | "none";
  reason: string;                 // neutral, never accusatory
  mismatchedFields: string[];
  checkedAt: string;
  registryVersion?: number;
  signatureValid?: boolean;
}

/** What came back from asking the issuer: were we able to reach it, and its entry (or null if none). */
export interface LookupOutcome { reachable: boolean; entry?: RegistryEntry | null }

/**
 * Verify a document's fields against the issuer registry.
 * `kind`: "digital" (exact record -> whole-record hash) or "scan" (user-confirmed OCR fields -> per-field comparison).
 */
export function verifyAgainstIssuer(
  fields: Fields, kind: "digital" | "scan", lookup: LookupOutcome, issuerPubB64: string, now = new Date(),
): VerifyResult {
  const checkedAt = now.toISOString();
  if (!lookup.reachable)
    return { state: "unverifiable", method: "none", mismatchedFields: [], checkedAt,
      reason: `Unverified: issuer unreachable at ${checkedAt.slice(11, 16)} UTC, retrying.` };
  const e = lookup.entry;
  if (!e)
    return { state: "unverifiable", method: "none", mismatchedFields: [], checkedAt, reason: "No matching record found at the issuer for this serial number." };

  const { signature, ...rest } = e;
  const sigOk = verifyText(signedPayload(rest), signature, issuerPubB64);
  if (!sigOk)
    return { state: "unverifiable", method: "none", mismatchedFields: [], checkedAt, signatureValid: false, registryVersion: e.version,
      reason: "The issuer's reply failed its signature check, so it was not trusted." };

  if (e.status === "revoked")
    return { state: "revoked", method: "none", mismatchedFields: [], checkedAt, signatureValid: true, registryVersion: e.version, reason: "The issuer has revoked this record." };
  if (e.status === "superseded")
    return { state: "superseded", method: "none", mismatchedFields: [], checkedAt, signatureValid: true, registryVersion: e.version,
      reason: `The issuer replaced this record${e.superseded_by ? ` with ${e.superseded_by}` : ""}.` };

  const mine = fieldHashes(fields);
  const theirs = e.field_hashes ?? {};
  const mismatched = Object.keys(theirs).filter((k) => mine[k] !== theirs[k]);
  const extra = Object.keys(mine).filter((k) => !(k in theirs));
  const bad = [...new Set([...mismatched, ...extra])];

  if (kind === "digital" && recordHash(fields) === e.record_hash)
    return { state: "verified", method: "hash", mismatchedFields: [], checkedAt, signatureValid: true, registryVersion: e.version,
      reason: "Byte-for-byte match with the issuer's record." };
  const n = Object.keys(theirs).length;
  if (kind === "scan" && bad.length === 0)
    return { state: "verified", method: "fields", mismatchedFields: [], checkedAt, signatureValid: true, registryVersion: e.version,
      reason: `Content matches the issuer's record on ${n} of ${n} fields (checked from a scan; weaker evidence than a file match).` };
  // Field values equal after trimming, but the record is not byte-identical (e.g. extra spaces).
  if (kind === "digital" && bad.length === 0)
    return { state: "verified", method: "fields", mismatchedFields: [], checkedAt, signatureValid: true, registryVersion: e.version,
      reason: `All ${n} field values match the issuer's record, but this copy is not byte-identical (spacing or formatting differs); weaker evidence than a file match.` };

  return { state: "tamper_flagged", method: kind === "digital" ? "hash" : "fields", mismatchedFields: bad, checkedAt, signatureValid: true, registryVersion: e.version,
    reason: `This copy doesn't match the issuer's record in: ${bad.join(", ")}. This can happen with a scanning or typing mistake; please check it against your original.` };
}

/**
 * If the issuer can't be reached: give each attempt up to 8 seconds, then retry in the background
 * after 10 s, 30 s, 60 s and 120 s (about 2 minutes in total), then offer a manual "Retry now".
 */
export const ISSUER_ATTEMPT_TIMEOUT_MS = 8000;
export const ISSUER_RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000];
