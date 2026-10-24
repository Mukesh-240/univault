/**
 * SHARING tests. In plain words, these check that:
 *   - the share state machine allows only the legal steps;
 *   - a link opens only with the approved recipient ID and a fresh one-time code, each code works once,
 *     and the owner is notified exactly for: first open, a new device, wrong ID, wrong/reused code and
 *     attempts on revoked / killed / expired links — not for an ordinary repeat view;
 *   - view-only shares never serve a download; downloads need the signed pass from the opened page;
 *   - the same idempotency key always gives the same link (so a retry can't create a second share);
 *   - leak trace finds the opening a watermark came from;
 *   - in the database (offline store): only fingerprints are stored — never the raw link token or a
 *     one-time code — every attempt is in access_log AND the ledger, killing one link leaves another
 *     working, and the ledger still verifies.
 */
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { verify } from "../src/lib/ledger";
import { newStore, offlineClient } from "../src/lib/offline-db";
import { createShare, killShare, linkByTokenHash, listNotifications, loadShares, logAccess } from "../src/lib/share-store";
import {
  canMove, checkDownloadPass, checkExpiry, decideCodeRequest, decideDownload, decideOpen, downloadPass, hashCode, hashDevice,
  matchLeak, shareToken, type LinkFacts, type PastAccess,
} from "../src/lib/shares";
import { watermarkLabel } from "../src/lib/watermark";

const NOW = new Date("2026-10-24T10:00:00.000Z");
const KEY = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const link = (over: Partial<LinkFacts> = {}): LinkFacts => ({ shareRevoked: false, tokenKilled: false, expiresAt: "2026-10-31T10:00:00.000Z", recipientCode: "UV-R-1042", policy: "view_only", ...over });
const A = hashDevice("device-a"), B = hashDevice("device-b");
const issued = (code: string): PastAccess => ({ outcome: "code_issued", deviceHash: A, codeHash: hashCode(code), at: NOW.toISOString() });

describe("share rules", () => {
  it("state machine: only legal transitions", () => {
    expect(canMove("drafted", "previewed")).toBe(true);
    expect(canMove("active", "revoked")).toBe(true);
    expect(canMove("drafted", "active")).toBe(false);
    expect(canMove("revoked", "active")).toBe(false);
  });

  it("expiry: past is refused at creation, at most 30 days", () => {
    expect(checkExpiry("2026-10-23T10:00:00.000Z", NOW)).toEqual({ ok: false, reason: "expiry_in_past" });
    expect(checkExpiry("2026-11-23T10:00:00.000Z", NOW)).toEqual({ ok: true });
    expect(checkExpiry("2026-11-24T10:00:01.000Z", NOW)).toEqual({ ok: false, reason: "expiry_too_far" });
  });

  it("code requests need a live link and the approved ID", () => {
    expect(decideCodeRequest(link(), { recipientId: "uv-r-1042", deviceHash: A, now: NOW })).toEqual({ outcome: "code_issued", notify: null });
    expect(decideCodeRequest(link(), { recipientId: "UV-R-9999", deviceHash: A, now: NOW })).toEqual({ outcome: "denied:wrong_recipient", notify: "wrong_recipient_attempt" });
    expect(decideCodeRequest(link({ tokenKilled: true }), { recipientId: "UV-R-1042", deviceHash: A, now: NOW }).notify).toBe("killed_link_attempt");
    expect(decideCodeRequest(link({ shareRevoked: true }), { recipientId: "UV-R-1042", deviceHash: A, now: NOW }).notify).toBe("revoked_link_attempt");
    expect(decideCodeRequest(link({ expiresAt: NOW.toISOString() }), { recipientId: "UV-R-1042", deviceHash: A, now: NOW }).notify).toBe("expired_link_attempt");
    expect(decideCodeRequest(null, { recipientId: "UV-R-1042", deviceHash: A, now: NOW })).toEqual({ outcome: "denied:unknown_link", notify: null });
  });

  it("codes work once; first open, repeat view, new device and reuse are told apart", () => {
    const past: PastAccess[] = [issued("111111")];
    const open = (code: string, dev: string) => decideOpen(link(), { recipientId: "UV-R-1042", code, deviceHash: dev, now: NOW }, past);
    expect(open("222222", A)).toEqual({ outcome: "denied:wrong_code", notify: "wrong_code_attempt" });
    expect(open("111111", A)).toEqual({ outcome: "allowed", notify: "first_open" });
    past.push({ outcome: "allowed", deviceHash: A, codeHash: hashCode("111111") });
    expect(open("111111", B)).toEqual({ outcome: "denied:otp_reused", notify: "wrong_code_attempt" });
    past.push(issued("333333"));
    expect(open("333333", A)).toEqual({ outcome: "allowed", notify: null }); // same device: ordinary repeat view
    past.push(issued("444444"));
    expect(open("444444", B)).toEqual({ outcome: "allowed", notify: "new_device" });
  });

  it("an old code stops working after 10 minutes, and the view limit is enforced", () => {
    const late = new Date(NOW.getTime() + 11 * 60 * 1000);
    expect(decideOpen(link(), { recipientId: "UV-R-1042", code: "111111", deviceHash: A, now: late }, [issued("111111")]).outcome).toBe("denied:wrong_code");
    const past = [issued("1"), { outcome: "allowed", deviceHash: A, codeHash: hashCode("1") }, issued("2")];
    expect(decideOpen(link({ maxViews: 1 }), { recipientId: "UV-R-1042", code: "2", deviceHash: A, now: NOW }, past).outcome).toBe("denied:max_views");
  });

  it("downloads: view-only never serves a file; a pass from the opened page is required", () => {
    const pass = downloadPass(KEY, "tokenhash", "ABC234", NOW);
    expect(checkDownloadPass(KEY, "tokenhash", pass, NOW)).toEqual({ ok: true, session: "ABC234" });
    expect(checkDownloadPass(KEY, "other-link", pass, NOW).ok).toBe(false);
    expect(checkDownloadPass(KEY, "tokenhash", pass, new Date(NOW.getTime() + 16 * 60 * 1000)).ok).toBe(false);
    expect(decideDownload(link(), true, NOW).outcome).toBe("denied:view_only");
    expect(decideDownload(link({ policy: "download" }), true, NOW).outcome).toBe("download");
    expect(decideDownload(link({ policy: "download" }), false, NOW).outcome).toBe("denied:wrong_code");
  });

  it("same idempotency key -> same 256-bit link; different key -> different link", () => {
    const k = "6f1c2a8e-0000-4000-8000-000000000001";
    expect(shareToken(KEY, k)).toEqual(shareToken(KEY, k));
    expect(shareToken(KEY, k).token).not.toBe(shareToken(KEY, "6f1c2a8e-0000-4000-8000-000000000002").token);
    expect(Buffer.from(shareToken(KEY, k).token, "base64url")).toHaveLength(32);
  });

  it("leak trace: the watermark text resolves to the one opening it came from", () => {
    const rows = [{ session: "AAAAAA", recipientCode: "UV-R-1042" }, { session: "BCDEFG", recipientCode: "UV-R-1042" }, { session: "BCDEFG", recipientCode: "UV-R-7777" }];
    const text = watermarkLabel({ name: "Some Recipient", recipientCode: "UV-R-1042", time: "today", session: "BCDEFG" });
    expect(matchLeak(text, rows).matches).toEqual([rows[1]]);
    expect(matchLeak("nothing readable", rows).matches).toEqual([]);
  });
});

describe("share store (offline database)", () => {
  const setup = async () => {
    const store = newStore();
    const db = offlineClient(store) as unknown as SupabaseClient;
    const make = async (key: string, code: string) => {
      const { token, tokenHash } = shareToken(KEY, key);
      const draft = { recipient_code: code, purpose: "job", fields: ["id_card.name"], expires_at: "2026-11-01T00:00:00.000Z", policy: { mode: "view_only" as const } };
      const ids = await createShare(db, { owner: "demo", draft, recipientName: "Recipient", tokenHash, snapshot: { idem: key, docs: [] }, previewedAt: NOW.toISOString() });
      return { ...ids, token, tokenHash };
    };
    return { store, db, make };
  };

  it("stores only fingerprints: no raw token or one-time code anywhere in the database", async () => {
    const { store, db, make } = await setup();
    const s = await make("6f1c2a8e-0000-4000-8000-00000000000a", "UV-R-1042");
    const code = "987654";
    await logAccess(db, { tokenId: s.tokenId, shareId: s.shareId, outcome: "code_issued", deviceHash: A, notify: null, codeHash: hashCode(code) });
    const everything = JSON.stringify(store.tables);
    expect(everything).not.toContain(s.token);
    expect(everything).not.toContain(code);
    expect(everything).toContain(s.tokenHash);
  });

  it("every attempt is in access_log and the ledger; kill one link, the other still works; ledger verifies", async () => {
    const { store, db, make } = await setup();
    const one = await make("6f1c2a8e-0000-4000-8000-00000000000b", "UV-R-1042");
    const two = await make("6f1c2a8e-0000-4000-8000-00000000000c", "UV-R-2042");
    const ledgerBefore = store.tables.ledger.length;
    await logAccess(db, { tokenId: one.tokenId, shareId: one.shareId, outcome: "denied:wrong_recipient", deviceHash: B, notify: "wrong_recipient_attempt" });
    expect(store.tables.access_log).toHaveLength(1);
    expect(store.tables.ledger.length).toBe(ledgerBefore + 1);

    expect(await killShare(db, one.shareId, "test")).toBe(true);
    expect(await killShare(db, one.shareId, "test")).toBe(false); // already revoked: nothing more to do
    const l1 = await linkByTokenHash(db, one.tokenHash), l2 = await linkByTokenHash(db, two.tokenHash);
    expect(decideCodeRequest(l1!.link, { recipientId: "UV-R-1042", deviceHash: A, now: NOW }).outcome).toBe("denied:revoked");
    expect(decideCodeRequest(l2!.link, { recipientId: "UV-R-2042", deviceHash: A, now: NOW }).outcome).toBe("code_issued");

    const shares = await loadShares(db, "demo", NOW);
    expect(shares.find((s) => s.id === one.shareId)?.state).toBe("revoked");
    expect(shares.find((s) => s.id === two.shareId)?.state).toBe("active");
    expect((await listNotifications(db, "demo")).map((n) => n.kind)).toEqual(["wrong_recipient_attempt"]);
    expect((await verify(db)).ok).toBe(true);
    // Every share went drafted -> previewed -> confirmed -> active, each a separate event.
    expect(store.tables.share_events.filter((e) => e.share_id === two.shareId).map((e) => e.state)).toEqual(["drafted", "previewed", "confirmed", "active"]);
  });
});
