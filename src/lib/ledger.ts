/**
 * LEDGER — the tamper-evident diary of everything that happens in UNIVAULT.
 *
 * Plain-English picture:
 *   Think of a notebook where every new line also contains a "fingerprint" (a hash) of the line
 *   before it. If anyone secretly changes an old line, its fingerprint no longer matches the next
 *   line, so the chain visibly "breaks". That is what "hash-chained" means.
 *
 * Who does the work:
 *   The DATABASE does the fingerprinting (a trigger written in SQL, see docs/sql/001_core_schema.sql).
 *   This file only (1) adds a new line and (2) asks the database to re-check the whole chain.
 *   The database also refuses any attempt to edit or delete an old line.
 *
 * Privacy rule: a ledger line holds only ids, fingerprints and the kind of event —
 * never names, ID numbers, dates of birth or other sensitive values.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// "Db" = the connection to our Supabase database. We only need two abilities from it:
//   from(...) to add rows to a table, and rpc(...) to call a database function.
type Db = Pick<SupabaseClient, "from" | "rpc">;

/** What we get back after adding a line: its position number and its fingerprint. */
export interface LedgerLine { seq: number; hash: string }

/** Result of checking the whole chain: is it intact, how many lines, and where it broke (if it did). */
export interface LedgerCheck { ok: boolean; total: number; broken_at: number | null }

/**
 * Add one line to the ledger.
 * @param kind    a short label for what happened, e.g. "document.uploaded" or "share.revoked"
 * @param payload the non-sensitive details (ids, hashes), stored as JSON
 */
export async function append(db: Db, kind: string, payload: Record<string, unknown>): Promise<LedgerLine> {
  // We send only the kind and payload. The database fills in the previous line's fingerprint,
  // this line's fingerprint and the exact time, so the app cannot fake them.
  const r = await db.from("ledger").insert({ kind, payload }).select("seq, hash").single();
  // If the database said no, stop and say why (never continue silently).
  if (r.error) throw new Error(`ledger append failed: ${r.error.message}`);
  return r.data as LedgerLine;
}

/**
 * Re-check the entire chain, line by line, inside the database (function verify_ledger()).
 * Returns ok = true when every fingerprint still matches.
 */
export async function verify(db: Db): Promise<LedgerCheck> {
  const r = await db.rpc("verify_ledger");
  if (r.error) throw new Error(`verify_ledger failed: ${r.error.message}`);
  // The database returns a one-row table; numbers may arrive as text, so we convert them.
  const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { ok: boolean; total: number | string; broken_at: number | string | null };
  return { ok: row.ok, total: Number(row.total), broken_at: row.broken_at === null ? null : Number(row.broken_at) };
}
