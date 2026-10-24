/**
 * EVAL — `npm run eval` (optionally: npm run eval -- --today YYYY-MM-DD)
 *
 * Regenerates the DEV (seed 7), HELD-OUT (seed 99) and SHOWCASE (seed 2026) sets in memory, runs
 * the real engines on every case, compares with the generator's labels, and prints:
 *   1. per category: cases, evaluated, TP / FP / TN / FN, precision, recall, false alarms — dev and held-out
 *   2. OCR confidence calibration (are low-confidence fields really the wrong ones?)
 *   3. the 17 planted showcase conflicts: detected / not detected / not built yet
 * Tuning is done on DEV only; HELD-OUT is reported as it comes out.
 */
import { byDimension, checkShowcase, makeBench, metricsOf, ocrCalibration, runAll, type Metrics } from "../eval/harness";
import { loadPacks } from "../src/lib/rules";
import { generate } from "../synthetic/generate";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const today = arg("today") ?? new Date().toLocaleDateString("en-CA");
const packs = loadPacks();

const pct = (x: number | null) => (x === null ? "   n/a" : `${(x * 100).toFixed(1).padStart(5)}%`);
const row = (name: string, m: Metrics) =>
  `| ${name.padEnd(18)} | ${String(m.cases).padStart(5)} | ${String(m.evaluated).padStart(5)} | ${String(m.tp).padStart(4)} | ${String(m.fp).padStart(4)} | ${String(m.tn).padStart(4)} | ${String(m.fn).padStart(4)} | ${pct(m.precision)} | ${pct(m.recall)} | ${String(m.falseAlarms).padStart(6)} |`;

for (const [set, seed] of [["dev", 7], ["heldout", 99]] as const) {
  const g = generate({ seed, set, today });
  const results = runAll(makeBench(g.dataset, g.labels, packs));
  console.log(`\n## ${set.toUpperCase()} (seed ${seed}, reference date ${today}, ${g.dataset.meta.documents} documents)\n`);
  console.log("| Category           | Cases | Evald |   TP |   FP |   TN |   FN | Precis | Recall | FalseA |");
  console.log("|--------------------|-------|-------|------|------|------|------|--------|--------|--------|");
  for (const [dim, m] of Object.entries(byDimension(results))) console.log(row(dim, m));
  console.log(row("ALL (evaluated)", metricsOf(results)));
  const pending = results.filter((r) => !r.evaluated);
  if (pending.length) console.log(`\nNot evaluated yet: ${pending.length} cases (${[...new Set(pending.map((r) => r.dimension))].join(", ")}): ${pending[0].note}`);
  const wrong = results.filter((r) => r.evaluated && !r.correct);
  if (wrong.length) {
    console.log(`\nMisses / false alarms (${wrong.length}), by level:`);
    const byLevel = new Map<string, number>();
    for (const w of wrong) byLevel.set(`${w.dimension}/${w.level}`, (byLevel.get(`${w.dimension}/${w.level}`) ?? 0) + 1);
    for (const [k, n] of byLevel) console.log(`  - ${k}: ${n}  e.g. ${wrong.find((w) => `${w.dimension}/${w.level}` === k)!.note}`);
  }
  console.log("\nOCR confidence calibration (fields read from scans):");
  for (const c of ocrCalibration(results)) console.log(`  confidence ${c.band}: ${String(c.fields).padStart(4)} fields, ${String(c.misread).padStart(3)} misread (${c.errorRate === null ? "n/a" : (c.errorRate * 100).toFixed(0) + "%"})`);
}

const s = generate({ seed: 2026, set: "showcase", today });
console.log(`\n## SHOWCASE — 17 planted conflicts (graduate_demo, seed 2026)\n`);
for (const c of checkShowcase(makeBench(s.dataset, s.labels, packs)))
  console.log(`${String(c.id).padStart(2)}. ${c.detected === null ? "NOT BUILT YET" : c.detected ? "DETECTED     " : "NOT DETECTED "} ${c.title}\n      ${c.evidence}`);
