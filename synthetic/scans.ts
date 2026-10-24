/**
 * SCANS — make synthetic "scanned marksheet" images with known correct text.  Run: npm run scans
 *
 * Plain-English picture:
 *   To measure how well OCR (automatic text reading) works, we need pictures whose correct text we
 *   already know. This program invents marksheets for random synthetic people, draws them as
 *   images (English + Telugu), then damages each image like a bad scan: blur, speckle noise,
 *   tilt (skew), faded contrast. Every image says "SYNTHETIC" on it.
 *
 * Outputs:
 *   public/scans/scan-<n>-<damage>.png                 the images (served to the browser for the OCR page)
 *   synthetic/out/labels/scans-ground-truth.json       the correct text for each image (a label: kept
 *                                                      with the other labels, out of the app's reach)
 *
 * Drawing Telugu text needs a Telugu-capable font on the machine (Windows: "Nirmala UI").
 * The images are committed to git, so teammates don't need to regenerate them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { makeRng, type Rng } from "./prng";
import { makePerson, marksheet } from "./world";

const SEED = 4242;
const W = 900, H = 520;

/** The kinds of damage, one per image. */
const DAMAGE = [
  { name: "clean", blur: 0, noise: 0, rotate: 0, contrast: 1 },
  { name: "blur", blur: 1.6, noise: 0, rotate: 0, contrast: 1 },
  { name: "noise-skew", blur: 0.6, noise: 60, rotate: 3, contrast: 1 },
  { name: "lowcontrast-skew", blur: 0.9, noise: 25, rotate: -2, contrast: 0.45 },
] as const;

/** Escape text for safe use inside the SVG drawing. */
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

/** Draw the marksheet as an SVG picture: a title, then one "Label: value" line per field. */
function drawSvg(fields: Record<string, string>): string {
  const rows: [string, string][] = [
    ["Name", fields.name], ["Name (Telugu)", fields.name_te], ["Registration No.", fields.reg_no],
    ["Semester", fields.semester], ["Total marks", fields.total_marks], ["Result", fields.result], ["Serial", fields.serial],
  ];
  const text = rows.map(([label, value], i) =>
    `<text x="40" y="${130 + i * 52}" font-size="26" font-family="Nirmala UI, Gautami, Noto Sans Telugu, sans-serif">${esc(label)}: ${esc(value)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#fbfaf5"/>
    <text x="40" y="60" font-size="30" font-weight="bold" font-family="sans-serif">Synthetic State University — Marksheet</text>
    <text x="${W - 260}" y="${H - 24}" font-size="22" fill="#b00" font-family="sans-serif">SYNTHETIC · SIMULATED</text>
    ${text}</svg>`;
}

/** Add random speckle noise to raw pixels (deterministic: driven by the seeded generator). */
function speckle(pixels: Buffer, amount: number, rng: Rng): Buffer {
  const out = Buffer.from(pixels);
  for (let i = 0; i < out.length; i += 4) {
    const d = (rng.next() - 0.5) * 2 * amount;
    for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(255, out[i + c] + d));
  }
  return out;
}

async function main() {
  const rng = makeRng(SEED);
  const today = new Date().toLocaleDateString("en-CA");
  const outDir = join(process.cwd(), "public", "scans");
  mkdirSync(outDir, { recursive: true });
  const truth: { file: string; damage: string; fields: Record<string, string> }[] = [];

  for (const [i, dmg] of DAMAGE.entries()) {
    const person = makePerson(rng, today, { givenCount: 2 });
    const fields = marksheet(person, rng).doc.fields;
    // 1. draw, 2. turn into raw pixels, 3. add speckle, 4. blur / tilt / fade, 5. save as PNG.
    const { data, info } = await sharp(Buffer.from(drawSvg(fields))).flatten({ background: "#fbfaf5" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let img = sharp(dmg.noise ? speckle(data, dmg.noise, rng) : data, { raw: { width: info.width, height: info.height, channels: 4 } });
    if (dmg.blur) img = img.blur(dmg.blur);
    if (dmg.rotate) img = img.rotate(dmg.rotate, { background: "#ffffff" });
    if (dmg.contrast !== 1) img = img.linear(dmg.contrast, 255 * (1 - dmg.contrast));
    const file = `scan-${i + 1}-${dmg.name}.png`;
    await img.png().toFile(join(outDir, file));
    truth.push({ file: `scans/${file}`, damage: dmg.name, fields });
  }

  const labelsDir = join(process.cwd(), "synthetic", "out", "labels");
  mkdirSync(labelsDir, { recursive: true });
  writeFileSync(join(labelsDir, "scans-ground-truth.json"), JSON.stringify({ generator_seed: SEED, synthetic: true, scans: truth }, null, 1));
  console.info(`${truth.length} scan images written to public/scans/; ground truth in synthetic/out/labels/scans-ground-truth.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
