/**
 * SEED DATASET — put one generated synthetic dataset into a database, exactly like a real upload.
 *
 * Used by BOTH the command-line seed script (scripts/seed.ts, real Supabase) and the offline demo
 * store (src/lib/supabase.ts), so there is one recipe only:
 *   1. the simulated issuer's registry: each record is SIGNED now with the issuer's private key
 *      (records marked "rogue" get a deliberately wrong signature, to demonstrate forgery detection);
 *   2. the fictional recipients;
 *   3. every document, one by one, through ingestDocument() — the single front door;
 *   4. a ledger line saying the seed ran, then a full ledger check.
 * It reads DATA only; the answers (labels) are never touched.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dataset } from "../../synthetic/generate";
import { ingestDocument } from "./ingest";
import { append, verify, type LedgerCheck } from "./ledger";
import { newSalts } from "./issuer";
import { signEntries, toRow } from "./registry";

type Db = Pick<SupabaseClient, "from" | "rpc">;

/** What was stored, for the report. */
export interface SeedReport { registry: number; recipients: number; documents: number; skippedDocuments: number; ledger: LedgerCheck }

export async function seedDataset(db: Db, data: Dataset, issuerPrivB64: string, progress: (msg: string) => void = () => {}): Promise<SeedReport> {
  // 1. Simulated issuer registry — signed now; existing serial+version pairs are skipped.
  // Every record gets fresh random per-field salts; the SAME salts go to the holder with the document (step 3).
  const salts = new Map<string, Record<string, string>>();
  for (const r of data.registry) if (!salts.has(r.serial)) salts.set(r.serial, newSalts(Object.keys(r.fields)));
  const rows = signEntries(data.registry, issuerPrivB64, salts).map(toRow);
  const reg = await db.from("issuer_registry").upsert(rows, { onConflict: "serial,version", ignoreDuplicates: true });
  if (reg.error) throw new Error(`registry insert failed: ${reg.error.message}`);
  progress(`1. registry: ${rows.length} signed entries offered (existing ones skipped)`);

  // 2. Fictional recipients.
  const rec = await db.from("recipients").upsert(
    data.recipients.map((r) => ({ recipient_code: r.recipient_code, name: r.name, org: r.purpose, synthetic: true })),
    { onConflict: "recipient_code", ignoreDuplicates: true });
  if (rec.error) throw new Error(`recipients insert failed: ${rec.error.message}`);
  progress(`2. recipients: ${data.recipients.length} offered`);

  // 3. Documents — only if this dataset is not loaded yet (documents can never be edited or removed).
  const existing = await db.from("documents").select("id", { count: "exact", head: true }).eq("synthetic_origin->>dataset", data.meta.set);
  if (existing.error) throw new Error(`documents check failed: ${existing.error.message} (is migration 003 applied?)`);
  let stored = 0;
  if ((existing.count ?? 0) > 0) progress(`3. documents: "${data.meta.set}" already loaded (${existing.count}); skipped`);
  else {
    for (const doc of data.documents) { await ingestDocument(db, doc.serial && salts.has(doc.serial) ? { ...doc, salts: salts.get(doc.serial) } : doc); stored++; if (stored % 100 === 0) progress(`   ${stored}/${data.documents.length}`); }
    progress(`3. documents: ${stored} stored through ingestDocument()`);
  }

  // 4. Record the seed run, then re-verify the whole ledger.
  await append(db, "seed.completed", { dataset: data.meta.set, seed: data.meta.seed, documents_stored: stored, registry_offered: rows.length });
  const ledger = await verify(db);
  progress(`4. verify_ledger(): ${JSON.stringify(ledger)}`);
  if (!ledger.ok) throw new Error(`Ledger chain broken at line ${ledger.broken_at}`);
  return { registry: rows.length, recipients: data.recipients.length, documents: stored, skippedDocuments: stored ? 0 : existing.count ?? 0, ledger };
}
