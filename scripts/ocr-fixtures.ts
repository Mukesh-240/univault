/**
 * OCR FIXTURES — run the real OCR engine (Tesseract.js, English + Telugu) once on every generated scan
 * and save what it read, so the OCR page can show genuine OCR output even with no network.
 *   Run: npm run ocr:fixtures      Output: public/ocr/fixtures.json
 *
 * This file stores the engine's RAW lines and confidences only. Turning lines into fields happens in
 * src/lib/ocr-extract.ts, the same code the live in-browser OCR uses. Ground truth is NOT read here.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWorker } from "tesseract.js";
import pkg from "tesseract.js/package.json";
import type { OcrLine } from "../src/lib/ocr-extract";

interface Block { paragraphs: { lines: OcrLine[] }[] }

async function main() {
  const dir = join(process.cwd(), "public", "scans");
  const worker = await createWorker(["eng", "tel"]);
  const scans: { file: string; lines: OcrLine[] }[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".png")).sort()) {
    const { data } = await worker.recognize(join(dir, f), {}, { blocks: true });
    const lines = ((data.blocks ?? []) as unknown as Block[]).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), confidence: l.confidence }))));
    scans.push({ file: `scans/${f}`, lines });
    console.info(`${f}: ${lines.length} lines`);
  }
  await worker.terminate();
  writeFileSync(join(process.cwd(), "public", "ocr", "fixtures.json"),
    JSON.stringify({ engine: `tesseract.js ${pkg.version}`, languages: ["eng", "tel"], created: new Date().toISOString(), scans }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
