/**
 * GENERATE — the Synthetic Data Lab's main program.
 *
 * How to run it (from the univault folder):
 *   npm run synth -- --seed 7  --set dev        (the "development" set, used for tuning)
 *   npm run synth -- --seed 99 --set heldout    (the "held-out" set, never used for tuning; headline metrics)
 *   npm run synth -- --seed 2026 --set showcase (the one demo person used in the live demo)
 *   Optional: --n 300 (minimum number of documents), --per-level 10, --today YYYY-MM-DD
 *
 * What it produces:
 *   synthetic/out/data/dataset-<set>.json   the documents, issuer registry, recipients, requests, share scenarios
 *   synthetic/out/labels/labels-<set>.json  the CORRECT ANSWERS for every case (the app never reads this folder)
 *   synthetic/out/coverage-<set>.md         a table: how many cases for every dimension x level
 *
 * Same seed + same "today" => byte-identical output. "today" defaults to the computer's current
 * date, because cases like "expired 9 days ago" are relative to the day of the demo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeRng } from "./prng";
import { MATRIX, type Ctx, type CaseOut, type RequestDraft, type ScenarioDraft } from "./recipes";
import { graduateDemo, RECIPIENT_BANK, type Conflict } from "./showcase";
import { makePerson, type DocDraft, type NamePool, type RegDraft } from "./world";

export const GENERATOR = "univault-synthetic-lab";
export const VERSION = "1.0.0";

export type SetName = "dev" | "heldout" | "showcase";
/** `nameBank` replaces the name parts people are drawn from (used to rename everyone consistently in tests). */
export interface GenOptions { seed: number; set: SetName; today: string; perLevel?: number; minDocs?: number; nameBank?: NamePool }

/** A document as written to the dataset file: ready to pass straight into ingestDocument(). */
export interface DatasetDoc extends DocDraft {
  ref: string;
  owner: string;
  synthetic: true;
  synthetic_origin: { generator: string; version: string; seed: number; recipe: string; dataset: SetName; ref: string };
}
export interface Dataset {
  meta: { generator: string; version: string; seed: number; set: SetName; reference_date: string; documents: number };
  recipients: { name: string; purpose: string; recipient_code: string; synthetic: true }[];
  documents: DatasetDoc[];
  registry: RegDraft[];
  requests: (Omit<RequestDraft, "role" | "doc_roles"> & { ref: string; doc_refs: string[] })[];
  scenarios: (Omit<ScenarioDraft, "role" | "doc_roles"> & { ref: string; doc_refs: string[] })[];
}
export interface LabelCase { case_id: string; dimension: string; level: string; refs: string[]; conditions?: Record<string, unknown>; expected: Record<string, unknown> }
export interface Labels {
  meta: Dataset["meta"];
  cases: LabelCase[];
  conflicts?: Conflict[];
  negatives?: { ref: string; why: string }[];
}

/** Build the whole dataset in memory (no files touched). Used by the command line below and by the tests. */
export function generate(o: GenOptions): { dataset: Dataset; labels: Labels; coverage: Record<string, Record<string, number>> } {
  const rng = makeRng(o.seed);
  const perLevel = o.perLevel ?? 10;
  const minDocs = o.minDocs ?? 300;

  const documents: DatasetDoc[] = [];
  const registry: RegDraft[] = [];
  const requests: Dataset["requests"] = [];
  const scenarios: Dataset["scenarios"] = [];
  const cases: LabelCase[] = [];
  const coverage: Record<string, Record<string, number>> = {};
  let conflicts: Conflict[] | undefined;
  let negatives: { ref: string; why: string }[] | undefined;

  /** Run one recipe once and file its pieces into the dataset (data) and the labels (answers). */
  const runCase = <T extends CaseOut>(dimension: string, level: string, n: number, recipe: (c: Ctx) => T, owner: string): T => {
    const caseId = `${dimension}.${level}.${n}`;
    const refOf = (role: string) => `${o.set}:${caseId}:${role}`;
    const out = recipe({ rng, ref: o.today, person: (opts) => makePerson(rng, o.today, { pool: o.nameBank, ...opts }), refOf });
    for (const { role, doc } of out.docs)
      documents.push({ ...doc, ref: refOf(role), owner, synthetic: true,
        synthetic_origin: { generator: GENERATOR, version: VERSION, seed: o.seed, recipe: `${dimension}/${level}`, dataset: o.set, ref: refOf(role) } });
    registry.push(...out.registry);
    for (const { role, doc_roles, ...rq } of out.requests ?? []) requests.push({ ...rq, ref: refOf(role), doc_refs: doc_roles.map(refOf) });
    for (const { role, doc_roles, ...sc } of out.scenarios ?? []) scenarios.push({ ...sc, ref: refOf(role), doc_refs: doc_roles.map(refOf) });
    cases.push({ case_id: caseId, dimension, level, refs: out.docs.map((d) => refOf(d.role)), ...(out.conditions ? { conditions: out.conditions } : {}), expected: out.expected });
    coverage[dimension] = { ...coverage[dimension], [level]: (coverage[dimension]?.[level] ?? 0) + 1 };
    return out;
  };

  if (o.set === "showcase") {
    // One demo person, built by the graduate_demo recipe from the same mutators.
    const out = runCase("showcase", "graduate_demo", 0, graduateDemo, "demo");
    conflicts = out.conflicts;
    negatives = out.negatives;
  } else {
    // Every level of every dimension, perLevel times, each with fresh random people.
    for (const [dimension, levels] of Object.entries(MATRIX))
      for (const [level, recipe] of Object.entries(levels))
        for (let i = 0; i < perLevel; i++) runCase(dimension, level, i, recipe, `synthetic-${o.set}`);
    // Top up with extra clean people until we have at least minDocs documents.
    for (let i = perLevel; documents.length < minDocs; i++) runCase("negative_controls", "clean", i, MATRIX.negative_controls.clean, `synthetic-${o.set}`);
  }

  // Three fictional recipients, each with a made-up recipient code like UV-R-1042.
  const recipients = RECIPIENT_BANK.map((rc) => ({ ...rc, recipient_code: `UV-R-${rng.int(1000, 9999)}`, synthetic: true as const }));
  const meta = { generator: GENERATOR, version: VERSION, seed: o.seed, set: o.set, reference_date: o.today, documents: documents.length };
  return {
    dataset: { meta, recipients, documents, registry, requests, scenarios },
    labels: { meta, cases, ...(conflicts ? { conflicts, negatives } : {}) },
    coverage,
  };
}

/** Turn the coverage counts into a readable Markdown table (dimension x level -> number of cases). */
export function coverageTable(meta: Dataset["meta"], coverage: Record<string, Record<string, number>>): string {
  const lines = [`# Coverage — set "${meta.set}" (seed ${meta.seed}, reference date ${meta.reference_date})`, "",
    `Documents: **${meta.documents}**`, "", "| Dimension | Level | Cases |", "|---|---|---|"];
  for (const [dim, levels] of Object.entries(coverage))
    for (const [level, n] of Object.entries(levels)) lines.push(`| ${dim} | ${level} | ${n} |`);
  const all = Object.values(coverage).flatMap((l) => Object.values(l));
  lines.push("", `Levels: ${all.length} · minimum cases per level: ${Math.min(...all)} · total cases: ${all.reduce((a, b) => a + b, 0)}`);
  return lines.join("\n") + "\n";
}

/** Today's date on this computer as YYYY-MM-DD. */
const localToday = () => new Date().toLocaleDateString("en-CA");

/** Read a "--name value" option from the command line. */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Only run the command-line part when this file is executed directly (not when imported by tests).
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const set = (arg("set") ?? "dev") as SetName;
  if (!["dev", "heldout", "showcase"].includes(set)) throw new Error(`--set must be dev, heldout or showcase (got ${set})`);
  const seed = Number(arg("seed") ?? (set === "dev" ? 7 : set === "heldout" ? 99 : 2026));
  const today = arg("today") ?? localToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("--today must look like YYYY-MM-DD");
  const { dataset, labels, coverage } = generate({ seed, set, today, perLevel: Number(arg("per-level") ?? 10), minDocs: Number(arg("n") ?? 300) });

  const root = join(dirname(fileURLToPath(import.meta.url)), "out");
  const write = (rel: string, text: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  write(`data/dataset-${set}.json`, JSON.stringify(dataset, null, 1));
  write(`labels/labels-${set}.json`, JSON.stringify(labels, null, 1));
  const table = coverageTable(dataset.meta, coverage);
  write(`coverage-${set}.md`, table);
  process.stdout.write(table);
}
