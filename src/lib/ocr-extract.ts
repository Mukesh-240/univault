/**
 * OCR EXTRACT — turn the lines an OCR engine read off a scanned marksheet into named fields.
 *
 * Plain-English picture:
 *   Tesseract (the text reader) gives us lines of text, each with how sure it was (0–100).
 *   The marksheet layout prints one "Label: value" per line ("Total marks: 540"). This file finds
 *   which label each line most looks like (OCR may garble a letter or two of the label), and keeps the
 *   value with the line's confidence turned into 0–1. It never guesses a value: if a line has no
 *   colon or looks like no known label, it is ignored and the field is simply missing.
 *   The result is UNCONFIRMED until the person confirms or corrects each field.
 *
 * Used by the OCR page in the browser (live Tesseract) and by scripts/ocr-fixtures.ts (saved results),
 * so both paths read fields identically. No label/ground-truth file is ever read here.
 */

/** The marksheet's printed labels and the field each one fills (the document layout, not answers). */
export const MARKSHEET_LABELS: Record<string, string> = {
  "Name": "name", "Name (Telugu)": "name_te", "Registration No.": "reg_no", "Semester": "semester",
  "Total marks": "total_marks", "Result": "result", "Serial": "serial",
};

/** One line as the OCR engine reported it. */
export interface OcrLine { text: string; confidence: number } // confidence 0..100
/** One extracted field: the text read and how sure the engine was (0..1). */
export interface OcrField { value: string; confidence: number }

/** Letters and digits only, lower case: "Registration No." -> "registrationno". */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** How many single-letter edits turn a into b (Levenshtein distance). */
function edits(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Most labels may differ by up to a third of their letters and still count as that label. */
const MAX_LABEL_EDIT_RATIO = 0.34;

/** Which known label does this text look like? "Name (Telugu)" has the same letters as "Name" plus "telugu". */
function labelOf(raw: string, labels: string[]): string | null {
  const s = squash(raw);
  if (!s) return null;
  let best: { label: string; ratio: number } | null = null;
  for (const label of labels) {
    const l = squash(label);
    const ratio = edits(s, l) / Math.max(l.length, 1);
    if (!best || ratio < best.ratio) best = { label, ratio };
  }
  return best && best.ratio <= MAX_LABEL_EDIT_RATIO ? best.label : null;
}

/** Lines -> fields. The first line that matches a label wins; later duplicates are ignored. */
export function extractFields(lines: OcrLine[], layout: Record<string, string> = MARKSHEET_LABELS): Record<string, OcrField> {
  const out: Record<string, OcrField> = {};
  for (const line of lines) {
    const i = line.text.indexOf(":");
    if (i < 0) continue;
    const label = labelOf(line.text.slice(0, i), Object.keys(layout));
    const value = line.text.slice(i + 1).replace(/\s+/g, " ").trim();
    if (!label || !value || out[layout[label]]) continue;
    out[layout[label]] = { value, confidence: Math.round(Math.max(0, Math.min(100, line.confidence))) / 100 };
  }
  return out;
}
