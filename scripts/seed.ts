/**
 * SEED — by default adds ONLY the demo cast's receivers (Google) to an empty database: no documents, no registry, no
 * shares. The vault then fills only with what an issuer (VIT, Government) issues or the student adds.
 *   npm run seed                      the cast only (the app also does this by itself on first sign-in)
 *   npm run seed -- --set showcase    the old synthetic showcase dataset (documents + registry), for testing only
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
import { seedDataset } from "../src/lib/seed";
import type { Dataset } from "../synthetic/generate";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const set = arg("set") ?? "cast";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const issuerKey = process.env.ISSUER_PRIVATE_KEY;
if (!url || !key || key.startsWith("<")) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local first.");
if (!issuerKey) throw new Error("Set ISSUER_PRIVATE_KEY in .env.local (see UNIVAULT_SPEC.md section 12).");
const db = createClient(url, key);

async function main() {
  if (set === "cast") {
    const cast = JSON.parse(readFileSync(join(process.cwd(), "src", "config", "demo-cast.json"), "utf8")) as { receivers: { code: string; name: string; purpose: string }[] };
    const r = await db.from("recipients").upsert(cast.receivers.map((x) => ({ recipient_code: x.code, name: x.name, org: x.purpose })), { onConflict: "recipient_code", ignoreDuplicates: true });
    if (r.error) throw new Error(`recipients insert failed: ${r.error.message}`);
    console.info(`Cast added: ${cast.receivers.map((x) => x.name).join(", ")}. No documents were added (the vault starts empty).`);
    return;
  }
  const file = join(process.cwd(), "synthetic", "out", "data", `dataset-${set}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as Dataset;
  console.info(`Seeding "${set}" (seed ${data.meta.seed}, reference date ${data.meta.reference_date}): ${data.documents.length} documents, ${data.registry.length} registry records`);
  // The steps themselves live in src/lib/seed.ts (shared with the offline demo store).
  const report = await seedDataset(db, data, issuerKey!, (m) => console.info(m));
  console.info("Seeded:", JSON.stringify(report));
}
main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
