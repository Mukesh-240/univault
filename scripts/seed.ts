/**
 * SEED — load a generated synthetic dataset into the database.  Run: npm run seed  (or: npm run seed -- --set dev)
 *
 * Plain-English picture:
 *   Reads synthetic/out/data/dataset-<set>.json (DATA only — this script never opens the labels
 *   folder) and stores it the same way a real user upload would be stored:
 *     1. the simulated issuer's registry: each record is SIGNED now with ISSUER_PRIVATE_KEY
 *        (records marked "rogue" get a deliberately wrong signature, to demonstrate forgery detection);
 *     2. the three fictional recipients;
 *     3. every document, one by one, through ingestDocument() — the single front door;
 *     4. a ledger line saying the seed ran, then a full ledger check.
 *
 * Safe to run twice: documents are immutable, so if this dataset is already loaded the documents
 * are skipped; registry entries and recipients that already exist are left alone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ingestDocument } from "../src/lib/ingest";
import { append, verify } from "../src/lib/ledger";
import { signEntries, toRow } from "../src/lib/registry";
import type { Dataset } from "../synthetic/generate";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const set = arg("set") ?? "showcase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const issuerKey = process.env.ISSUER_PRIVATE_KEY;
if (!url || !key || key.startsWith("<")) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local first.");
if (!issuerKey) throw new Error("Set ISSUER_PRIVATE_KEY in .env.local (see UNIVAULT_SPEC.md section 12).");
const db = createClient(url, key);

async function main() {
  const file = join(process.cwd(), "synthetic", "out", "data", `dataset-${set}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as Dataset;
  console.info(`Seeding "${set}" (seed ${data.meta.seed}, reference date ${data.meta.reference_date}): ${data.documents.length} documents, ${data.registry.length} registry records`);

  // 1. Simulated issuer registry — signed now; existing serial+version pairs are skipped.
  const rows = signEntries(data.registry, issuerKey!).map(toRow);
  const reg = await db.from("issuer_registry").upsert(rows, { onConflict: "serial,version", ignoreDuplicates: true });
  if (reg.error) throw new Error(`registry insert failed: ${reg.error.message}`);
  console.info(`1. registry: ${rows.length} signed entries offered (existing ones skipped)`);

  // 2. Fictional recipients.
  const rec = await db.from("recipients").upsert(
    data.recipients.map((r) => ({ recipient_code: r.recipient_code, name: r.name, org: r.purpose, synthetic: true })),
    { onConflict: "recipient_code", ignoreDuplicates: true });
  if (rec.error) throw new Error(`recipients insert failed: ${rec.error.message}`);
  console.info(`2. recipients: ${data.recipients.length} offered`);

  // 3. Documents — only if this dataset is not loaded yet (documents can never be edited or removed).
  const existing = await db.from("documents").select("id", { count: "exact", head: true }).eq("synthetic_origin->>dataset", set);
  if (existing.error) throw new Error(`documents check failed: ${existing.error.message} (is migration 003 applied?)`);
  let stored = 0;
  if ((existing.count ?? 0) > 0) console.info(`3. documents: "${set}" already loaded (${existing.count}); skipped`);
  else {
    for (const doc of data.documents) { await ingestDocument(db, doc); stored++; if (stored % 100 === 0) console.info(`   ${stored}/${data.documents.length}`); }
    console.info(`3. documents: ${stored} stored through ingestDocument()`);
  }

  // 4. Record the seed run, then re-verify the whole ledger.
  await append(db, "seed.completed", { dataset: set, seed: data.meta.seed, documents_stored: stored, registry_offered: rows.length });
  const check = await verify(db);
  console.info("4. verify_ledger():", check);
  if (!check.ok) throw new Error(`Ledger chain broken at line ${check.broken_at}`);
}
main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
