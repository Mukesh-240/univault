/**
 * PHASE 3 library tests — the small pure pieces behind the screens. In plain words, these check that:
 *   - the trust tier shown on a card is computed from what happened (verified / corrected / uploaded);
 *   - the "stale data" fault makes earlier verifications stale and a new verification fresh again;
 *   - English and Telugu locale files have exactly the same keys, none empty;
 *   - every reason the engines actually produce for the showcase vault has a full Telugu rendering;
 *   - OCR lines become the right named fields (even with a garbled label), and the saved Tesseract
 *     results read most fields correctly; the calibration table accounts for every field.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calibration, compare, groundTruth } from "../eval/ocr-accuracy";
import { makeBench, verifyDoc } from "../eval/harness";
import { freshnessClock, setStale } from "../src/lib/faults";
import { localizeReason } from "../src/lib/i18n";
import { scanDocument, scanForInjection } from "../src/lib/injection";
import { extractFields, type OcrLine } from "../src/lib/ocr-extract";
import { candidatePairs } from "../src/lib/resolution";
import { evaluatePack, loadPacks } from "../src/lib/rules";
import { contextFor, tierOf, type VaultDoc } from "../src/lib/vault";
import { freshnessOf, type VerifyOutcome } from "../src/lib/verify";
import en from "../src/locales/en.json";
import te from "../src/locales/te.json";
import { generate } from "../synthetic/generate";

const doc: VaultDoc = { id: "d1", doc_type: "marksheet", title: "t", issuer: null, serial: null, capture: "scan", fields: { total_marks: "540" } };
const verified = { state: "verified", checkedAt: "2026-10-24T08:00:00.000Z" } as VerifyOutcome;

describe("trust tier", () => {
  it("is computed from verification and the person's assertions, never declared", () => {
    expect(tierOf(doc, { verification: {}, confirmedFields: {} })).toBe("user_uploaded");
    expect(tierOf(doc, { verification: {}, confirmedFields: { d1: { total_marks: "540" } } })).toBe("user_uploaded"); // confirmed as read
    expect(tierOf(doc, { verification: {}, confirmedFields: { d1: { total_marks: "504" } } })).toBe("user_corrected");
    expect(tierOf(doc, { verification: { d1: verified }, confirmedFields: { d1: { total_marks: "504" } } })).toBe("issuer_verified");
  });
});

describe("stale data fault", () => {
  it("ages verifications made before it was switched on, not later ones", () => {
    const now = new Date("2026-10-24T09:00:00.000Z");
    expect(freshnessOf(verified.checkedAt, freshnessClock(verified.checkedAt, now))).toBe("fresh");
    setStale(true, new Date("2026-10-24T08:30:00.000Z"));
    expect(freshnessOf(verified.checkedAt, freshnessClock(verified.checkedAt, now))).toBe("stale");
    const later = "2026-10-24T08:45:00.000Z";
    expect(freshnessOf(later, freshnessClock(later, now))).toBe("fresh");
    setStale(false);
    expect(freshnessOf(verified.checkedAt, freshnessClock(verified.checkedAt, now))).toBe("fresh");
  });
});

describe("locales", () => {
  it("English and Telugu have the same keys and no empty text", () => {
    expect(Object.keys(te).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(te)) expect(v.trim(), k).not.toBe("");
  });
  it("placeholders match between languages", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en)) expect(ph((te as Record<string, string>)[k]), k).toBe(ph((en as Record<string, string>)[k]));
  });
});

describe("Telugu reasons", () => {
  it("every reason the engines give for the showcase vault is fully translated", () => {
    const { dataset, labels } = generate({ seed: 2026, set: "showcase", today: "2026-10-24" });
    const packs = loadPacks();
    const bench = makeBench(dataset, labels, packs);
    const docs = [...bench.docs.values()];
    const ctx = contextFor(docs, bench.today);
    const reasons: string[] = [];
    // Before and after verification, so both "not checked" and every verification outcome are covered.
    for (const p of packs) reasons.push(...evaluatePack(p, ctx).results.map((r) => r.reason));
    for (const d of docs.filter((x) => x.serial && x.capture === "digital")) {
      const o = verifyDoc(d, bench.issuer, bench.now) as VerifyOutcome;
      ctx.verification[d.id] = o;
      reasons.push(o.reason);
    }
    for (const p of packs) reasons.push(...evaluatePack(p, ctx).results.map((r) => r.reason));
    for (const pair of candidatePairs(docs)) reasons.push(pair.explanation.reason, ...pair.explanations);
    for (const d of docs) reasons.push(...scanDocument(d).hits);
    reasons.push(scanForInjection(`x${String.fromCharCode(0x200b)}`, { hiddenText: true }) /* zero-width space + hidden text */.hits.join("; "));
    const untranslated = [...new Set(reasons)].filter((r) => localizeReason(r, "te").some((s) => s.lang === "en"));
    expect(untranslated).toEqual([]);
  });
});

describe("OCR field extraction", () => {
  it("maps 'Label: value' lines to fields, tolerating a garbled label, and keeps confidence 0..1", () => {
    const lines: OcrLine[] = [
      { text: "Synthetic State University — Marksheet", confidence: 93 },
      { text: "Regstration N0.: 12AB34", confidence: 81 },
      { text: "Total marks: 540", confidence: 96 },
      { text: "no colon on this line", confidence: 99 },
    ];
    expect(extractFields(lines)).toEqual({ reg_no: { value: "12AB34", confidence: 0.81 }, total_marks: { value: "540", confidence: 0.96 } });
  });

  it("saved Tesseract results: every field found, most read exactly, calibration covers every field", () => {
    const fx = JSON.parse(readFileSync("public/ocr/fixtures.json", "utf8")) as { scans: { file: string; lines: OcrLine[] }[] };
    const truth = groundTruth();
    let correct = 0, total = 0;
    const rows: { confidence: number; correct: boolean }[] = [];
    for (const s of fx.scans) {
      const read = extractFields(s.lines);
      const tr = truth.get(s.file)!.fields;
      expect(Object.keys(read).sort()).toEqual(Object.keys(tr).sort());
      const c = compare(Object.fromEntries(Object.entries(read).map(([k, v]) => [k, v.value])), tr);
      correct += c.correct; total += c.total;
      for (const [k, v] of Object.entries(read)) rows.push({ confidence: v.confidence, correct: v.value === tr[k] });
    }
    expect(correct / total).toBeGreaterThanOrEqual(0.7);
    expect(calibration(rows).reduce((s, b) => s + b.fields, 0)).toBe(rows.length);
  });
});
