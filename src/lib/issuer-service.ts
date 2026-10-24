/**
 * ISSUER SERVICE — the SIMULATED ISSUER's "look up a serial number" logic, as a function.
 *
 * Plain-English picture:
 *   The pretend issuer answers "what do you have on record for serial X?" with its signed registry
 *   entries (fingerprints + status + signature, newest version first) — never the document's values.
 *   If it is switched "down" (issuer_config.is_down, the fault panel's switch) it stalls for 9 s, longer
 *   than UNIVAULT is willing to wait (8 s), and then says it is unavailable.
 *   Both the public route POST /api/issuer/lookup and UNIVAULT's own verification call this function
 *   directly (no web request to itself, which keeps it working on serverless hosts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistryEntry } from "./issuer";
import { fromRow } from "./registry";

type Db = Pick<SupabaseClient, "from">;

/** How long a "down" issuer stalls before saying it is unavailable (longer than the app's 8 s limit). */
export const DOWN_STALL_MS = 9000;

export interface IssuerAnswer { reachable: boolean; history: RegistryEntry[] }

/** Wait `ms`, but stop early if the caller gives up (the 8-second limit). */
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); });
});

export async function issuerLookup(db: Db, serial: string, opts: { delayMs?: number; signal?: AbortSignal } = {}): Promise<IssuerAnswer> {
  const cfg = await db.from("issuer_config").select("is_down").eq("id", 1).single();
  if (cfg.error) throw new Error(`issuer config unavailable: ${cfg.error.code ?? ""}`);
  if ((cfg.data as { is_down: boolean }).is_down) {
    await sleep(opts.delayMs ?? DOWN_STALL_MS, opts.signal);
    return { reachable: false, history: [] };
  }
  if (opts.delayMs) await sleep(opts.delayMs, opts.signal);
  const rows = await db.from("issuer_registry").select("*").eq("serial", serial).order("version", { ascending: false });
  if (rows.error) throw new Error(`issuer registry unavailable: ${rows.error.code ?? ""}`);
  return { reachable: true, history: (rows.data ?? []).map((r) => fromRow(r as Record<string, unknown>)) };
}
