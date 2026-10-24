/**
 * DUPLICATES & DATE-OF-BIRTH CONSISTENCY (spec F2 items 9 and 13).
 *
 * Plain-English picture:
 *   findDuplicates() spots documents that are copies of each other:
 *     exact     — byte-for-byte the same content,
 *     rescan    — the same paper photographed again (same serial, same values, but a scan),
 *     near      — the same values written slightly differently (capital letters, date style),
 *     same_serial_different_content — two documents claim the same serial number but a value
 *                 differs (worth a look: one of them may have a typing mistake).
 *   dobConsistency() checks the date of birth across documents AFTER reading every date style, so
 *   "14-05-2003" and "2003-05-14" are recognised as the same day (no false mismatch).
 */
import { canon, sha256 } from "./crypto";
import { parseDate } from "./dates";
import { explain, type Explanation } from "./explain";
import type { VaultDoc } from "./vault";

export type DuplicateKind = "exact" | "near" | "rescan" | "same_serial_different_content";
export interface DuplicatePair { a: string; b: string; kind: DuplicateKind; reason: string; explanation: Explanation }

/** Fingerprint of the content — the same formula ingest.ts uses for a document's content address. */
const contentHash = (d: VaultDoc) => d.sha256 ?? sha256(canon({ capture: d.capture, fields: d.fields, body_text: d.body_text ?? null, hidden_text: d.hidden_text ?? null }));

/** Tidy a value for comparison: dates to one style; text to lower case with single spaces. */
const normalise = (v: string) => parseDate(v) ?? v.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** Same fields with the same tidied values? */
function sameValues(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.join() === kb.join() && ka.every((k) => normalise(a[k]) === normalise(b[k]));
}

const REASONS: Record<DuplicateKind, string> = {
  exact: "These two documents have identical content.",
  rescan: "Same serial number and the same values: this looks like a scan of the same paper.",
  near: "Same values, written slightly differently (capitalisation or date style).",
  same_serial_different_content: "Both documents carry the same serial number, but some values differ. One may contain a scanning or typing mistake.",
};

/** Every pair of same-type documents that look like duplicates, with the kind and a plain reason. */
export function findDuplicates(docs: VaultDoc[]): DuplicatePair[] {
  const out: DuplicatePair[] = [];
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const [x, y] = [docs[i], docs[j]];
    if (x.doc_type !== y.doc_type) continue;
    let kind: DuplicateKind | null = null;
    if (contentHash(x) === contentHash(y)) kind = "exact";
    else if (x.serial && x.serial === y.serial) kind = sameValues(x.fields, y.fields) ? (x.capture !== y.capture ? "rescan" : "near") : "same_serial_different_content";
    else if (sameValues(x.fields, y.fields)) kind = "near";
    if (!kind) continue;
    const reason = REASONS[kind];
    out.push({ a: x.id, b: y.id, kind, reason, explanation: explain({ reason, confidence: { kind: "evidence", value: kind === "exact" ? "strong" : "weaker" }, source: { name: "UNIVAULT duplicate check", freshness: "n/a" }, documentIds: [x.id, y.id] }) });
  }
  return out;
}

export interface DobCheck { consistent: boolean | null; dates: { docId: string; raw: string; iso: string | null }[]; reason: string }

/** Do all documents that show a date of birth agree on it? null = can't tell (a date couldn't be read). */
export function dobConsistency(docs: VaultDoc[], field = "dob"): DobCheck {
  const dates = docs.filter((d) => d.fields[field]).map((d) => ({ docId: d.id, raw: d.fields[field], iso: parseDate(d.fields[field]) }));
  if (dates.some((d) => d.iso === null)) return { consistent: null, dates, reason: "A date of birth could not be read with certainty." };
  const distinct = new Set(dates.map((d) => d.iso));
  return distinct.size <= 1
    ? { consistent: true, dates, reason: dates.length > 1 ? "Same date of birth on every document (different print styles are fine)." : "Only one date of birth on file." }
    : { consistent: false, dates, reason: `Documents show different dates of birth: ${[...distinct].join(", ")}.` };
}

/** The date-of-birth check in the shared <Explain> shape (so the screen can show it like every other result). */
export const dobExplanation = (c: DobCheck): Explanation => explain({
  reason: c.reason,
  confidence: { kind: "tri", value: c.consistent === null ? "unknown" : c.consistent ? "pass" : "fail" },
  source: { name: "UNIVAULT date-of-birth check", freshness: "n/a" },
  documentIds: c.dates.map((d) => d.docId),
});
