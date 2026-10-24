/**
 * Tests for the single front door, ingestDocument(), using a pretend database that just records
 * what would have been written. In plain words, these check that:
 *   - a good document is stored as: cover record + content + "uploaded" event + one ledger line,
 *   - scans also get an "extracted" event marked unconfirmed,
 *   - nothing can make a document "issuer-verified" at upload time,
 *   - a malformed upload is refused and NOTHING is stored,
 *   - the ledger helper passes the database's chain check through correctly.
 */
import { describe, expect, it } from "vitest";
import { ingestDocument, type Db } from "../src/lib/ingest";
import { verify } from "../src/lib/ledger";
import { generate } from "../synthetic/generate";

/** A stand-in for Supabase: remembers every inserted row per table. */
function fakeDb(opts: { failTable?: string } = {}) {
  const rows: Record<string, Record<string, unknown>[]> = {};
  let n = 0;
  const from = (table: string) => ({
    insert: (v: Record<string, unknown> | Record<string, unknown>[]) => {
      const error = table === opts.failTable ? { message: "refused", code: "42501" } : null;
      if (!error) (rows[table] ??= []).push(...(Array.isArray(v) ? v : [v]));
      const result = { data: null, error };
      // Supabase lets you either await insert() directly, or chain .select().single().
      return Object.assign(Promise.resolve(result), {
        select: () => ({ single: async () => ({ data: error ? null : table === "ledger" ? { seq: ++n, hash: "h" } : { id: `id-${++n}` }, error }) }),
      });
    },
  });
  const rpc = async () => ({ data: [{ ok: true, total: "3", broken_at: null }], error: null });
  return { rows, db: { from, rpc } as unknown as Db };
}

const show = generate({ seed: 2026, set: "showcase", today: "2026-10-25" }).dataset.documents;
const digital = show.find((d) => d.capture === "digital")!;
const scan = show.find((d) => d.capture === "scan" && d.doc_type === "marksheet")!;

describe("ingestDocument", () => {
  it("stores cover record, content, uploaded event and a ledger line", async () => {
    const { rows, db } = fakeDb();
    const r = await ingestDocument(db, digital);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.documents[0]).toMatchObject({ source_tier: "user_uploaded", synthetic: true, synthetic_origin: digital.synthetic_origin, sha256: r.sha256 });
    expect(rows.document_payloads[0]).toMatchObject({ document_id: r.id, content: { fields: digital.fields } });
    expect(rows.document_events.map((e) => e.state)).toEqual(["uploaded"]);
    expect(rows.ledger[0]).toMatchObject({ kind: "document.uploaded", payload: { document_id: r.id, sha256: r.sha256 } });
  });
  it("ledger line carries no personal values", async () => {
    const { rows, db } = fakeDb();
    await ingestDocument(db, digital);
    const line = JSON.stringify(rows.ledger);
    for (const v of Object.values(digital.fields)) expect(line).not.toContain(v);
  });
  it("scans get an 'extracted' event that is NOT confirmed", async () => {
    const { rows, db } = fakeDb();
    await ingestDocument(db, scan);
    expect(rows.document_events).toEqual([
      expect.objectContaining({ state: "uploaded" }),
      expect.objectContaining({ state: "extracted", detail: { source: "ocr", confirmed: false } }),
    ]);
  });
  it("cannot be talked into issuer-verified", async () => {
    const { rows, db } = fakeDb();
    await ingestDocument(db, { ...digital, source_tier: "issuer_verified" });
    expect(rows.documents[0].source_tier).toBe("user_uploaded");
  });
  it("same content gives the same fingerprint; changed content a different one", async () => {
    const a = await ingestDocument(fakeDb().db, digital);
    const b = await ingestDocument(fakeDb().db, { ...digital, title: "renamed" });
    const c = await ingestDocument(fakeDb().db, { ...digital, fields: { ...digital.fields, name: "x" } });
    expect(b.sha256).toBe(a.sha256);   // the title is a label, not content
    expect(c.sha256).not.toBe(a.sha256);
  });
  it.each([
    ["missing fields", { ...digital, fields: undefined }],
    ["bad field name", { ...digital, fields: { "Bad Key": "x" } }],
    ["unknown capture", { ...digital, capture: "fax" }],
    ["confidence out of range", { ...scan, ocr_confidence: { name: 7 } }],
    ["not an object", "hello"],
  ])("malformed upload (%s) is refused and nothing is stored", async (_label, bad) => {
    const { rows, db } = fakeDb();
    await expect(ingestDocument(db, bad)).rejects.toThrow();
    expect(rows).toEqual({});
  });
  it("a database refusal is reported, not swallowed", async () => {
    await expect(ingestDocument(fakeDb({ failTable: "documents" }).db, digital)).rejects.toThrow(/document insert failed/);
  });
});

describe("ledger.verify", () => {
  it("returns the database's verdict as numbers", async () => {
    expect(await verify(fakeDb().db)).toEqual({ ok: true, total: 3, broken_at: null });
  });
});
