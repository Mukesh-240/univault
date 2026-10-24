/**
 * DB CHECK — "can we talk to the database, and is the ledger intact?"  Run: npm run db:check
 *
 * Steps:
 *   1. read the simulated issuer's on/off switch (issuer_config),
 *   2. add one harmless line to the ledger ("connectivity.check"),
 *   3. ask the database to re-verify the whole hash chain (verify_ledger()),
 *   4. confirm the new synthetic_origin column (migration 003) exists.
 */
import { createClient } from "@supabase/supabase-js";
import { append, verify } from "../src/lib/ledger";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || key.startsWith("<")) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local first.");
const db = createClient(url, key);

async function main() {
  const cfg = await db.from("issuer_config").select("is_down, updated_at").eq("id", 1).single();
  if (cfg.error) throw new Error(`issuer_config read failed: ${cfg.error.message}`);
  console.info("1. issuer_config:", cfg.data);

  const line = await append(db, "connectivity.check", { source: "scripts/db-check.ts" });
  console.info("2. ledger line appended: seq", line.seq);

  const check = await verify(db);
  console.info("3. verify_ledger():", check);
  if (!check.ok) throw new Error(`Ledger chain broken at line ${check.broken_at}`);

  const col = await db.from("documents").select("synthetic_origin").limit(1);
  console.info("4. documents.synthetic_origin column:", col.error ? `MISSING — apply docs/sql/003_synthetic_origin.sql (${col.error.message})` : "present");
}
main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
