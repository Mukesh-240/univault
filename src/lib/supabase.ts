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
import { newStore, offlineClient, type Store } from "./offline-db";
import { log } from "./scrub";
import { seedDataset } from "./seed";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when there is no usable database key, so the offline demo store is in use. */
export const OFFLINE = !url || !key || key.startsWith("<") || key.length < 40;

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

/** Offline store allowed? Always in development; in production only with the explicit test opt-in. */
export const ALLOW_OFFLINE = process.env.NODE_ENV !== "production" || process.env.UNIVAULT_OFFLINE_DEMO === "1";
/** False = production without a database key: pages show "Database not configured", APIs refuse. */
export const DB_CONFIGURED = !OFFLINE || ALLOW_OFFLINE;

/** A client that refuses everything (production without a key). */
function notConfigured(): SupabaseClient {
  const refuse = () => { throw new Error("Database not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."); };
  return { from: refuse, rpc: refuse } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = !OFFLINE ? createClient(url!, key!) : ALLOW_OFFLINE ? offline() : notConfigured();
