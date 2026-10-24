/**
 * DISCLOSURE — share only the fields (or yes/no facts) a recipient needs (spec F9).
 *
 * Plain-English picture:
 *   1. UNIVAULT puts each shareable value in its own sealed "envelope" (a disclosure): the value plus
 *      a random salt. Only the fingerprint of each envelope goes into a credential that UNIVAULT
 *      signs. Yes/no facts such as "over 18" or "passed" are added as signed ATTESTATIONS.
 *   2. For a share, only the envelopes for the approved fields are handed over. The recipient can
 *      check each envelope against the signed fingerprints, but cannot open the ones not given.
 *   3. verifyPresentation() is the recipient's check: signature genuine, and every revealed value
 *      matches a signed fingerprint.
 *   This mirrors the SD-JWT idea ("SD-JWT-style"); we implemented the small scheme ourselves
 *   instead of using the archived @sd-jwt/core library.
 *
 *   HONEST LIMIT (must be shown in the UI): this is a signed ATTESTATION, not zero-knowledge.
 *   UNIVAULT sees your full data and vouches for "over 18 = yes"; the recipient trusts UNIVAULT's
 *   signature and cannot prove the fact independently.
 */
import { canon, randomToken, sha256, signText, verifyText } from "./crypto";
import { ageOn, parseDate } from "./dates";
import { fieldValue, type EngineContext } from "./vault";

export const ATTESTATION_STATEMENT = "Signed attestation by UNIVAULT, which sees your full data. This is not a zero-knowledge proof.";

/** One sealed envelope, as text: base64url of the JSON array [salt, key, value]. */
type EncodedDisclosure = string;
const encode = (salt: string, key: string, value: string): EncodedDisclosure => Buffer.from(JSON.stringify([salt, key, value])).toString("base64url");
const decode = (d: EncodedDisclosure) => JSON.parse(Buffer.from(d, "base64url").toString()) as [string, string, string];
const digest = (d: EncodedDisclosure) => sha256(d);

export interface SdPayload {
  iss: string;                              // who signs: UNIVAULT (prototype)
  kind: "sd-jwt-style";
  iat: string;                              // issued at
  statement: string;
  _sd: string[];                            // fingerprints of every envelope (sorted)
  attestations: Record<string, boolean>;    // e.g. { "id_card.over_18": true }
}
export interface SdCredential { payload: SdPayload; signature: string; disclosures: EncodedDisclosure[] }

/** Seal values and sign the credential (server-side, vault key). Only APPROVED attestations should be passed in. */
export function issueCredential(values: Record<string, string>, attestations: Record<string, boolean>, vaultPrivB64: string, now: Date): SdCredential {
  const disclosures = Object.entries(values).map(([k, v]) => encode(randomToken(16), k, v));
  const payload: SdPayload = { iss: "UNIVAULT (prototype)", kind: "sd-jwt-style", iat: now.toISOString(), statement: ATTESTATION_STATEMENT, _sd: disclosures.map(digest).sort(), attestations };
  return { payload, signature: signText(canon(payload), vaultPrivB64), disclosures };
}

/** Hand over only the envelopes for the approved keys. */
export function present(cred: SdCredential, approved: string[]): SdCredential {
  const keep = new Set(approved);
  return { payload: cred.payload, signature: cred.signature, disclosures: cred.disclosures.filter((d) => keep.has(decode(d)[1])) };
}

export interface PresentationCheck { valid: boolean; revealed: Record<string, string>; attestations: Record<string, boolean>; problems: string[]; statement: string }

/** The recipient's check: genuine signature, and every revealed value matches a signed fingerprint. */
export function verifyPresentation(p: SdCredential, vaultPubB64: string): PresentationCheck {
  const problems: string[] = [];
  if (!verifyText(canon(p.payload), p.signature, vaultPubB64)) problems.push("Signature is not valid.");
  const signed = new Set(p.payload._sd);
  const revealed: Record<string, string> = {};
  for (const d of p.disclosures) {
    if (!signed.has(digest(d))) { problems.push("A revealed value does not match the signed credential."); continue; }
    const [, key, value] = decode(d);
    revealed[key] = value;
  }
  return { valid: problems.length === 0, revealed, attestations: p.payload.attestations, problems, statement: p.payload.statement };
}

/**
 * Compute the yes/no facts from trusted (digital or person-confirmed) values only:
 *   id_card.over_18 — from the ID card's date of birth;   marksheet.passed — from the marksheet result.
 * A fact that can't be computed from trusted data is simply left out (never guessed).
 */
export function attestationsFor(ctx: EngineContext): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const id = ctx.docs.find((d) => d.doc_type === "id_card");
  if (id) { const v = fieldValue(id, "dob", ctx); const dob = v.trusted ? parseDate(v.value) : null; if (dob) out["id_card.over_18"] = ageOn(dob, ctx.today) >= 18; }
  const ms = ctx.docs.find((d) => d.doc_type === "marksheet");
  if (ms) { const v = fieldValue(ms, "result", ctx); if (v.trusted && v.value) out["marksheet.passed"] = v.value.trim().toUpperCase() === "PASS"; }
  return out;
}

/**
 * What the recipient will see for a list of approved items ("doc_type.field", or derived items
 * "id_card.id_number_last4", "id_card.over_18", "marksheet.passed"). Anything not approved is absent.
 * A value read by OCR that the person has not confirmed yet is NEVER shared: it is listed in `withheld`.
 */
export function recipientView(ctx: EngineContext, approved: string[]): { fields: Record<string, string>; attestations: Record<string, boolean>; withheld: string[]; statement: string } {
  const facts = attestationsFor(ctx);
  const fields: Record<string, string> = {};
  const attestations: Record<string, boolean> = {};
  const withheld: string[] = [];
  for (const item of approved) {
    if (item in facts) { attestations[item] = facts[item]; continue; }
    const [type, field] = item.split(".");
    const doc = ctx.docs.find((d) => d.doc_type === type);
    if (!doc) continue;
    const v = fieldValue(doc, field === "id_number_last4" ? "id_number" : field, ctx);
    if (v.value === undefined) continue;
    if (!v.trusted) { withheld.push(item); continue; } // unconfirmed OCR reading: not shared
    fields[item] = field === "id_number_last4" ? `XXXX XXXX ${v.value.replace(/\D/g, "").slice(-4)}` : v.value;
  }
  return { fields, attestations, withheld, statement: ATTESTATION_STATEMENT };
}
