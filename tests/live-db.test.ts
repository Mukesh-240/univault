/**
 * LIVE DATABASE tests — run against the real Supabase project in .env.local, with the same public
 * (anon / publishable) key the app uses. Skipped automatically when no real key is set.
 *
 * In plain words, these check that:
 *   - a new ledger line can be appended, and verify_ledger() still says the chain is intact;
 *   - with the app's key, NOTHING already written can be changed or deleted — not the new ledger
 *     line, and not a row in any other history table. Each attempt must either raise the
 *     "append-only" trigger error or change zero rows (row-level security hides the row from
 *     UPDATE/DELETE), and the row must read back exactly as before.
 *   - the only two writes the design allows are the documented ones: the issuer on/off switch
 *     (fault demo) and deleting a document's content (the erase flow). They are not tested here.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { append, verify } from "../src/lib/ledger";

try { process.loadEnvFile(".env.local"); } catch { /* no local env: the suite is skipped below */ }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const LIVE = url.startsWith("https://") && (key.startsWith("sb_publishable_") || key.startsWith("eyJ"));

// Every history table, its primary key, and one harmless column to try to overwrite.
const PROTECTED: { table: string; pk: string; column: string }[] = [
  { table: "ledger", pk: "seq", column: "kind" },
  { table: "documents", pk: "id", column: "title" },
  { table: "document_events", pk: "id", column: "detail" },
  { table: "assertions", pk: "id", column: "evidence" },
  { table: "entity_links", pk: "id", column: "explanation" },
  { table: "issuer_registry", pk: "id", column: "status" },
  { table: "recipients", pk: "id", column: "name" },
  { table: "shares", pk: "id", column: "purpose" },
  { table: "share_events", pk: "id", column: "detail" },
  { table: "share_tokens", pk: "id", column: "watermark" },
  { table: "token_events", pk: "id", column: "reason" },
  { table: "access_log", pk: "id", column: "client_hint" },
  { table: "document_payloads", pk: "document_id", column: "ocr_confidence" }, // UPDATE only: erase may DELETE by design
];
const JSON_COLUMNS = new Set(["detail", "explanation", "ocr_confidence"]);

describe.skipIf(!LIVE)("live database (real Supabase, app's public key)", () => {
  const db = createClient(url, key);

  it("append a ledger line, then the whole chain still verifies", async () => {
    await append(db, "test.live_ledger", { source: "tests/live-db.test.ts" });
    expect(await verify(db)).toMatchObject({ ok: true, broken_at: null });
  });

  it.each(PROTECTED)("$table: UPDATE and DELETE are refused and the row is unchanged", async ({ table, pk, column }) => {
    const newest = await db.from(table).select("*").order(pk, { ascending: false }).limit(1);
    expect(newest.error).toBeNull();
    expect(newest.data, `${table} has no row to attack — create one first (run the e2e journey)`).toHaveLength(1);
    const before = newest.data![0] as Record<string, unknown>;
    const id = before[pk] as string;

    const upd = await db.from(table).update({ [column]: JSON_COLUMNS.has(column) ? { tampered: true } : "tampered" }).eq(pk, id).select();
    expect(upd.error !== null || upd.data!.length === 0).toBe(true);
    if (table !== "document_payloads") {
      const del = await db.from(table).delete().eq(pk, id).select();
      expect(del.error !== null || del.data!.length === 0).toBe(true);
    }

    const after = await db.from(table).select("*").eq(pk, id).single();
    expect(after.data).toEqual(before);
  });

  it("after all those attempts the ledger still verifies", async () => {
    expect(await verify(db)).toMatchObject({ ok: true, broken_at: null });
  });
});
