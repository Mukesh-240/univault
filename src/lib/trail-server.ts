/**
 * TRAIL EVIDENCE (server only, read-only) — which ledger lines an action just wrote, so the step trail can show their
 * real line numbers. It only READS the ledger (never writes, never changes a decision). If the lookup fails, the
 * trail simply says the lines are being written instead of showing numbers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerRef } from "./trail";

type Db = Pick<SupabaseClient, "from">;

/** Ledger lines whose payload names one of these ids, e.g. [["share_id", [id]], ["token_id", [tokenId]]]. */
export async function ledgerLinesFor(db: Db, by: [key: string, values: string[]][]): Promise<LedgerRef[]> {
  const out: LedgerRef[] = [];
  for (const [key, values] of by) {
    if (!values.length) continue;
    try {
      const r = await db.from("ledger").select("seq, kind").in(`payload->>${key}`, values);
      if (!r.error) out.push(...((r.data ?? []) as LedgerRef[]));
    } catch { /* the offline demo store may not support JSON paths: the trail then says "being written" */ }
  }
  return [...new Map(out.map((l) => [l.seq, l])).values()].sort((a, b) => a.seq - b.seq);
}
