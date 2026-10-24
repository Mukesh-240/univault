/**
 * OCR REVIEW HINTS — which fields read from a scan should the person look at first?
 *
 * Plain-English picture:
 *   Text read by OCR is NEVER trusted until the person confirms it (that rule holds for every field).
 *   To make confirming easier, we point at the fields most likely to be wrong, for two reasons:
 *     1. low confidence: the OCR engine itself was unsure (below LOW_CONFIDENCE), or
 *     2. implausible characters: a single letter that OCR typically confuses with a digit
 *        (O for 0, l/I for 1, S for 5, B for 8, b for 6, Z for 2) sitting among digits, e.g. "9l1452".
 *        Runs of real letters such as the "SSU" in a registration number are left alone.
 *   Reason 2 matters because OCR is sometimes confidently wrong (the calibration table shows it).
 *   Misreads that still look plausible (a dropped letter, a broken Telugu conjunct) cannot be
 *   caught this way — which is exactly why confirmation is always required.
 */
import type { VaultDoc } from "./vault";

/** OCR fields below this confidence are pointed out first. Chosen on the DEV set (calibration table in `npm run eval`). */
export const LOW_CONFIDENCE = 0.7;

export interface ReviewHint { field: string; why: string[] }

/** One digit-look-alike letter that has a digit before it (or starts the token) and a digit after it (or ends the token). */
const LOOKALIKE_AMONG_DIGITS = /(?:^|\d)[OolISBbZ](?=\d|$)/;

/** True when a token with at least two digits contains a lone digit-look-alike letter, e.g. "9l1452" or "S36". */
export function hasDigitLookalike(value: string): boolean {
  return value.split(/[\s\-/.:,]+/).some((tok) => (tok.match(/\d/g) ?? []).length >= 2 && LOOKALIKE_AMONG_DIGITS.test(tok));
}

/** Fields of a scanned document worth reviewing first, with the reasons. Digital originals: none. */
export function reviewHints(doc: VaultDoc): ReviewHint[] {
  if (doc.capture !== "scan") return [];
  return Object.entries(doc.fields).flatMap(([field, value]) => {
    const why: string[] = [];
    const c = doc.ocr_confidence?.[field];
    if (c !== undefined && c < LOW_CONFIDENCE) why.push(`low reading confidence (${c.toFixed(2)})`);
    if (hasDigitLookalike(value)) why.push("a letter appears where a digit is expected (common OCR confusion)");
    return why.length ? [{ field, why }] : [];
  });
}
