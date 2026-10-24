/**
 * Tests for the OFFLINE DEMO STORE (used when no database key is set). In plain words, these check it
 * obeys the same rules as the real database:
 *   - history can be added to but never edited or deleted; only document content can be erased and
 *     only the issuer on/off switch can be changed;
 *   - the ledger chains its own fingerprints and the chain check spots a secretly edited line;
 *   - seeding the showcase goes through ingestDocument() and the engines can load the vault back.
 */
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ingestDocument } from "../src/lib/ingest";
import { append, verify } from "../src/lib/ledger";
import { newStore, offlineClient, rowCount } from "../src/lib/offline-db";
import { seedDataset } from "../src/lib/seed";
import { loadVault } from "../src/lib/vault";
import { generate } from "../synthetic/generate";

const key = () => generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const fresh = () => { const store = newStore(); return { store, db: offlineClient(store) as unknown as SupabaseClient }; };

describe("offline demo store", () => {
  it("refuses edits and deletes of history, allows erasing content and the issuer switch", async () => {
    const { db } = fresh();
    const doc = await db.from("documents").insert({ owner: "o", doc_type: "x", title: "t", sha256: "h" }).select("id").single();
    const id = (doc.data as { id: string }).id;
    expect((await db.from("documents").update({ title: "changed" }).eq("id", id)).error?.message).toMatch(/append-only/);
    expect((await db.from("documents").delete().eq("id", id)).error?.message).toMatch(/append-only/);
    expect((await db.from("ledger").delete().eq("seq", 1)).error?.message).toMatch(/append-only/);
    await db.from("document_payloads").insert({ document_id: id, content: { fields: {} } });
    expect((await db.from("document_payloads").delete().eq("document_id", id)).error).toBeNull();
    expect((await db.from("issuer_config").update({ is_down: true }).eq("id", 1)).error).toBeNull();
    expect((await db.from("issuer_config").select("is_down").eq("id", 1).single()).data).toEqual({ is_down: true });
  });

  it("rejects rows pointing at a document that does not exist", async () => {
    const { db } = fresh();
    expect((await db.from("assertions").insert({ document_id: "nope", field: "f", asserted_value: "v" })).error?.code).toBe("23503");
  });

  it("chains the ledger and detects a secretly edited line", async () => {
    const { store, db } = fresh();
    for (let i = 0; i < 5; i++) await append(db, "test.line", { i });
    expect(await verify(db)).toEqual({ ok: true, total: 5, broken_at: null });
    (store.tables.ledger[2].payload as { i: number }).i = 99; // tamper behind the store's back
    expect(await verify(db)).toEqual({ ok: false, total: 5, broken_at: 3 });
  });

  it("seeds the showcase through ingestDocument() and loads it back for the engines", async () => {
    const { store, db } = fresh();
    const { dataset } = generate({ seed: 2026, set: "showcase", today: "2026-10-24" });
    const report = await seedDataset(db, dataset, key());
    expect(report).toMatchObject({ documents: dataset.documents.length, registry: dataset.registry.length, ledger: { ok: true } });
    expect(rowCount(store, "documents")).toBe(dataset.documents.length);
    expect(rowCount(store, "ledger")).toBe(dataset.documents.length + 1); // one per upload + the seed line
    // Seeding twice stores nothing new (documents are immutable).
    expect((await seedDataset(db, dataset, key())).documents).toBe(0);
    const ctx = await loadVault(db, "demo", "2026-10-24");
    expect(ctx.docs).toHaveLength(dataset.documents.length);
    expect(ctx.docs.every((d) => Object.keys(d.fields).length > 0)).toBe(true);
    expect(ctx.verification).toEqual({}); // nothing is verified until verification runs
  });

  it("ledger verifies after every single write (property, 200 random writes; live database: pending key)", async () => {
    const { db } = fresh();
    const { dataset } = generate({ seed: 7, set: "dev", today: "2026-10-24" });
    for (let i = 0; i < 200; i++) {
      if (i % 2) await ingestDocument(db, dataset.documents[(i * 37) % dataset.documents.length]);
      else await append(db, `prop.write.${i % 7}`, { i, nested: { list: [i, String(i)] } });
      expect((await verify(db)).ok).toBe(true);
    }
  });
});
