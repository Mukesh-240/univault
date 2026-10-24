/**
 * ANON PROBE — asks the database exactly what the PUBLIC anon key can read, using real queries (read-only).
 *   Run: npx tsx scripts/anon-probe.ts   (needs the two NEXT_PUBLIC_SUPABASE_* values in .env.local)
 * For every table it tries a SELECT and prints the table, how many rows came back (up to 1000) and the column names.
 * It never prints a value, never inserts, updates or deletes. The result is the evidence behind the "anon key" limit
 * in the threat model: whatever is readable here is readable by anyone who views the page source.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const TABLES = ["documents", "document_payloads", "document_events", "assertions", "entity_links", "issuer_registry", "issuer_config", "shares", "share_events", "share_tokens", "token_events", "access_log", "ledger", "recipients"];

async function main() {
  for (const t of TABLES) {
    const r = await db.from(t).select("*").limit(1000);
    if (r.error) { console.log(`${t.padEnd(18)} DENIED (${r.error.code})`); continue; }
    const cols = Object.keys((r.data ?? [])[0] ?? {});
    console.log(`${t.padEnd(18)} READABLE rows=${(r.data ?? []).length} columns=${cols.join(",")}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
