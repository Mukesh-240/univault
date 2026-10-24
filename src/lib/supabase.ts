/**
 * SUPABASE — the connection to our database (hosted by Supabase, a managed Postgres service).
 *
 * It uses the PUBLIC "anon" key, which is safe to expose in a browser: the database itself decides
 * what this key may do (read, and append new rows — never edit or delete history). Demo-mode caveat
 * (stated in the threat model): there is no real login in this prototype.
 * The two values come from .env.local, which is never committed to git.
 *
 * OFFLINE MODE: if no real key is configured (missing, or still the "<placeholder>"), the app uses the
 * in-memory offline demo store instead (src/lib/offline-db.ts). It enforces the same append-only rules
 * and hash-chained ledger, and is filled once with the showcase dataset through the same seed function
 * and the same ingestDocument() front door. The screen says "Offline demo store" whenever this is on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Dataset } from "../../synthetic/generate";
import { ALLOW_OFFLINE, OFFLINE, SUPABASE_KEY as key, SUPABASE_URL as url } from "./db-config";
import { newStore, offlineClient, type Store } from "./offline-db";
import { log } from "./scrub";
import { seedDataset } from "./seed";

// The settings check lives in db-config.ts (shared with the middleware); re-exported for the pages.
export { ALLOW_OFFLINE, DB_CONFIGURED, OFFLINE } from "./db-config";

/** One offline store per server process (kept on globalThis so every route shares it). */
function offline(): SupabaseClient {
  const g = globalThis as unknown as { __univaultOffline?: { store: Store; client: SupabaseClient } };
  if (!g.__univaultOffline) {
    const store = newStore();
    let seeding: Promise<void> | undefined;
    const ready = () => (seeding ??= (async () => {
      const issuerKey = process.env.ISSUER_PRIVATE_KEY;
      if (!issuerKey) throw new Error("ISSUER_PRIVATE_KEY is not set (see UNIVAULT_SPEC.md section 12).");
      const data = JSON.parse(readFileSync(join(process.cwd(), "synthetic", "out", "data", "dataset-showcase.json"), "utf8")) as Dataset;
      const report = await seedDataset(offlineClient(store) as unknown as SupabaseClient, data, issuerKey);
      log("info", "offline demo store seeded", { documents: report.documents, registry: report.registry });
    })());
    g.__univaultOffline = { store, client: offlineClient(store, ready) as unknown as SupabaseClient };
  }
  return g.__univaultOffline.client;
}


/** A client that refuses everything (production without a key). */
function notConfigured(): SupabaseClient {
  const refuse = () => { throw new Error("Database not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."); };
  return { from: refuse, rpc: refuse } as unknown as SupabaseClient;
}

// SERVER-ONLY KEY (optional): when SUPABASE_SERVICE_ROLE_KEY is set, the server uses it instead of the public anon key,
// so the database can be locked to the server (docs/sql/004_lock_anon.sql removes every anon policy). It is never a
// NEXT_PUBLIC value, so it is never sent to a browser. Without it the demo falls back to the anon key and its limit
// (anyone with the public key can read the tables; see the threat model).
const SERVER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const serverKey = SERVER_KEY && SERVER_KEY.length > 40 && !SERVER_KEY.startsWith("<") ? SERVER_KEY : key;

export const supabase: SupabaseClient = !OFFLINE ? createClient(url!, serverKey!, { auth: { persistSession: false } }) : ALLOW_OFFLINE ? offline() : notConfigured();
