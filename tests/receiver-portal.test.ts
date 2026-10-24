/**
 * RECEIVER PORTAL tests (src/lib/receiver-portal.ts). In plain words:
 *   - a receiver inbox holds ONLY the shares addressed to its own code, and it can open only those: another
 *     receiver share answers "not available", and the view shows only the items the sender approved;
 *   - opening is logged like opening a link (the sender is told about a first opening), and a stopped, expired or
 *     used-up share cannot be opened;
 *   - a request is recorded with ids and item names only; asking for more than the purpose needs is flagged; a
 *     request is "answered" once a share to that receiver covers an asked item;
 *   - a problem report accepts only a share addressed to the reporter and one of three fixed reasons.
 * Everything runs through the real pipeline on the offline store.
 */
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { verify } from "../src/lib/ledger";
import { newStore, offlineClient } from "../src/lib/offline-db";
import { inboxFor, openForReceiver, reportProblem, reportsAboutHolder, requestsFor, requestsToHolder, sendRequest } from "../src/lib/receiver-portal";
import { loadPacks } from "../src/lib/rules";
import { seedDataset } from "../src/lib/seed";
import { createShare, killShare, loadShares } from "../src/lib/share-store";
import { shareToken } from "../src/lib/shares";
import { loadVault } from "../src/lib/vault";
import { generate } from "../synthetic/generate";

const vaultOf = (db: SupabaseClient) => () => loadVault(db, "demo", "2026-10-24");
const NOW = new Date("2026-10-24T10:00:00.000Z");
const k = generateKeyPairSync("ed25519");
const PRIV = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

async function world() {
  const store = newStore();
  const db = offlineClient(store) as unknown as SupabaseClient;
  await seedDataset(db, generate({ seed: 2026, set: "showcase", today: "2026-10-24" }).dataset, PRIV);
  const vault = await loadVault(db, "demo", "2026-10-24");
  const doc = vault.docs.find((d) => d.fields.name)!;
  const codes = ((await db.from("recipients").select("recipient_code, name").order("recipient_code")).data ?? []) as { recipient_code: string; name: string }[];
  const item = `${doc.doc_type}.name`;
  let n = 0;
  const share = async (code: string, expires = "2026-11-01T00:00:00.000Z", max_views?: number) => {
    const idem = `6f1c2a8e-0000-4000-8000-00000000000${++n}`;
    const r = await createShare(db, {
      owner: "demo", recipientName: codes.find((c) => c.recipient_code === code)!.name, tokenHash: shareToken(PRIV, idem).tokenHash, previewedAt: NOW.toISOString(),
      draft: { recipient_code: code, purpose: "job", fields: [item], expires_at: expires, policy: { mode: "view_only", ...(max_views ? { max_views } : {}) } },
      snapshot: { idem, docs: [{ id: doc.id, title: doc.title, doc_type: doc.doc_type, state: "verified", checked_at: NOW.toISOString() }] },
    });
    return r.shareId;
  };
  return { db, store, codes: codes.map((c) => c.recipient_code), item, share };
}

describe("inbox and viewer", () => {
  it("each receiver sees and opens only the shares addressed to it", async () => {
    const { db, codes, item, share } = await world();
    const mine = await share(codes[0]), theirs = await share(codes[1]);
    expect((await inboxFor(db, codes[0], NOW)).map((s) => s.id)).toEqual([mine]);
    const ok = await openForReceiver(db, codes[0], mine, NOW, vaultOf(db));
    expect(ok.ok && Object.keys(ok.view.fields)).toEqual([item]);
    expect(ok.ok && ok.watermark).toContain(codes[0]);
    expect(await openForReceiver(db, codes[0], theirs, NOW, vaultOf(db))).toEqual({ ok: false, reason: "not_found" });
    expect((await verify(db)).ok).toBe(true);
  });

  it("the first opening is logged so the sender is told; a stopped or expired share cannot be opened", async () => {
    const { db, codes, share } = await world();
    const a = await share(codes[0]);
    await openForReceiver(db, codes[0], a, NOW, vaultOf(db));
    expect((await loadShares(db, "demo", NOW))[0].accesses.some((x) => x.outcome === "allowed" && x.notify === "first_open")).toBe(true);
    await killShare(db, a, "test");
    expect(await openForReceiver(db, codes[0], a, NOW, vaultOf(db))).toMatchObject({ ok: false });
    const b = await share(codes[0], "2026-10-24T12:00:00.000Z");
    expect(await openForReceiver(db, codes[0], b, new Date("2026-10-25T00:00:00.000Z"), vaultOf(db))).toEqual({ ok: false, reason: "expired" });
    const c = await share(codes[0], "2026-11-01T00:00:00.000Z", 1);
    expect((await openForReceiver(db, codes[0], c, NOW, vaultOf(db))).ok).toBe(true);
    expect(await openForReceiver(db, codes[0], c, NOW, vaultOf(db))).toEqual({ ok: false, reason: "max_views" });
  });
});

describe("requests and reports", () => {
  it("records ids and items only, flags asking for more than the purpose needs, and is answered by a share", async () => {
    const { db, store, codes, item, share } = await world();
    const pack = loadPacks()[0];
    const extra = [...new Set(loadPacks().flatMap((p) => p.allowed_fields))].find((f) => !pack.allowed_fields.includes(f))!;
    const fine = await sendRequest(db, { from: codes[0], fromPurpose: pack.purpose, to: "demo", items: [pack.allowed_fields[0]] });
    const wide = await sendRequest(db, { from: codes[0], fromPurpose: pack.purpose, to: "demo", items: [pack.allowed_fields[0], extra] });
    expect(fine).toMatchObject({ ok: true, flagged: false });
    expect(wide).toMatchObject({ ok: true, flagged: true });
    expect(await sendRequest(db, { from: codes[0], fromPurpose: pack.purpose, to: "demo", items: [] })).toMatchObject({ ok: false });
    const line = store.tables.ledger.find((l) => l.kind === "request.sent")!;
    expect(Object.keys(line.payload as object).sort()).toEqual(["extra", "flagged", "from", "items", "request_id", "to"]);
    expect((await requestsToHolder(db, "demo")).length).toBe(2);
    expect((await requestsFor(db, codes[0])).every((r) => !r.answered)).toBe(true);
    // A share to this receiver after the request, covering an asked item, answers it.
    await sendRequest(db, { from: codes[0], fromPurpose: pack.purpose, to: "demo", items: [item] });
    await new Promise((r) => setTimeout(r, 5));
    await share(codes[0]);
    expect((await requestsFor(db, codes[0])).filter((r) => r.items.includes(item)).every((r) => r.answered)).toBe(true);
    expect((await requestsFor(db, codes[1])).length).toBe(0);
  });

  it("a report needs a share addressed to the reporter and shows up for the sender", async () => {
    const { db, codes, share } = await world();
    const a = await share(codes[0]);
    expect(await reportProblem(db, codes[1], a, "looks_wrong")).toBe(false);
    expect(await reportProblem(db, codes[0], a, "looks_wrong")).toBe(true);
    expect(await reportsAboutHolder(db, "demo")).toMatchObject([{ shareId: a, code: codes[0], reason: "looks_wrong" }]);
  });
});
