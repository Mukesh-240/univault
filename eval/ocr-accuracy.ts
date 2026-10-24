/**
 * OCR ACCURACY — an EVALUATION tool (not part of any decision).
 *
 * Plain-English picture:
 *   We know the correct text of every generated scan (synthetic/out/labels/scans-ground-truth.json,
 *   written when the images were drawn). This file compares what OCR read — and what the person ends up
 *   with after confirming/correcting — against that correct text, field by field:
 *     - accuracy BEFORE corrections: the OCR reading as stored (the original, never changed);
 *     - accuracy AFTER corrections: the person's confirmed/corrected value where there is one;
 *     - a CALIBRATION table: when OCR said it was 90% sure, was it right about 90% of the time?
 *   A match must be exact (after trimming outer spaces); an invisible joiner character counts as a
 *   difference, because a byte-different value would not match the issuer's record either.
 *   Only the OCR page's evaluation panel uses this. The app's decisions never read labels.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface TruthScan { file: string; damage: string; fields: Record<string, string> }

/** The correct text of every generated scan, keyed by image path ("scans/scan-1-clean.png"). */
export function groundTruth(): Map<string, TruthScan> {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "synthetic", "out", "labels", "scans-ground-truth.json"), "utf8")) as { scans: TruthScan[] };
  return new Map(raw.scans.map((s) => [s.file, s]));
}

const same = (a: string | undefined, b: string) => a !== undefined && a.trim() === b.trim();

/** Field-by-field comparison of one set of values with the truth. Missing fields count as wrong. */
export function compare(values: Record<string, string>, truth: Record<string, string>) {
  const perField = Object.keys(truth).map((f) => ({ field: f, correct: same(values[f], truth[f]) }));
  return { correct: perField.filter((p) => p.correct).length, total: perField.length, perField };
}

/** Confidence bands for the calibration table (upper bound exclusive, except the last). */
export const BANDS: [number, number][] = [[0, 0.7], [0.7, 0.85], [0.85, 0.9], [0.9, 0.95], [0.95, 1.0001]];

/** For each band: how many fields fell in it, how many were right, and the average stated confidence. */
export function calibration(rows: { confidence: number; correct: boolean }[]) {
  return BANDS.map(([lo, hi]) => {
    const inBand = rows.filter((r) => r.confidence >= lo && r.confidence < hi);
    const right = inBand.filter((r) => r.correct).length;
    const meanConfidence = inBand.length ? inBand.reduce((s, r) => s + r.confidence, 0) / inBand.length : null;
    return { lo, hi: Math.min(hi, 1), fields: inBand.length, right, accuracy: inBand.length ? right / inBand.length : null, meanConfidence };
  });
}
