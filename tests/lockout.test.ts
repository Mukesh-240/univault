/**
 * SLOW-DOWN tests: the per-address / per-link rate limit (src/lib/rate-limit.ts) and the
 * "5 wrong codes lock the link for 15 minutes" rule (src/lib/shares.ts). In plain words:
 *   - the 61st request from one address in a minute, or the 21st on one link, is refused with a wait
 *     time; a new minute starts fresh; one address being blocked does not block another;
 *   - 4 wrong codes do not lock; the 5th does; a successful open in between starts the count again;
 *   - the lock lasts exactly 15 minutes, and is read back from the access log in the database
 *     (offline store), so every server instance agrees — and the owner gets a "share_locked" alert.
 */
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { newStore, offlineClient } from "../src/lib/offline-db";
import { hit, RECIPIENT_LIMITS, recipientLimit } from "../src/lib/rate-limit";
import { createShare, linkByTokenHash, listNotifications, logAccess } from "../src/lib/share-store";
import { LOCK_MS, lockedUntil, MAX_WRONG_CODES, shareToken, wrongCodesSinceReset, type PastAccess } from "../src/lib/shares";

const T0 = Date.parse("2026-10-24T10:00:00.000Z");
const req = (ip: string) => new Request("http://x/s/t", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
const wrong = (at = "2026-10-24T10:00:00.000Z"): PastAccess => ({ outcome: "denied:wrong_code", deviceHash: "d", at });

describe("rate limit", () => {
  it("refuses past the per-minute limit, with a wait time; a new minute starts fresh", () => {
    const lim = { max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) expect(hit("k1", lim, T0 + i).ok).toBe(true);
    expect(hit("k1", lim, T0 + 10_000)).toEqual({ ok: false, retryAfterS: 50 });
    expect(hit("k2", lim, T0 + 10_000).ok).toBe(true); // another key is not affected
    expect(hit("k1", lim, T0 + 60_000).ok).toBe(true); // next window
  });

  it("recipient pages: 60 per address and 20 per link each minute", () => {
    expect(RECIPIENT_LIMITS).toEqual({ perIp: { max: 60, windowMs: 60_000 }, perToken: { max: 20, windowMs: 60_000 } });
    const now = T0 + 5 * 60_000;
    for (let i = 0; i < 20; i++) expect(recipientLimit(req("203.0.113.9"), "link-a", now).ok).toBe(true);
    expect(recipientLimit(req("203.0.113.10"), "link-a", now).ok).toBe(false); // the link is used up, whoever asks
    expect(recipientLimit(req("203.0.113.10"), "link-b", now).ok).toBe(true);
    let n = 2; // 203.0.113.10 already made 2 requests
    while (recipientLimit(req("203.0.113.10"), `link-${n}`, now).ok) n++;
    expect(n).toBe(60); // the 61st request from that address is refused
  });
});

describe("lock after wrong codes", () => {
  it("the 5th wrong or reused code in a row locks; a successful open resets the count", () => {
    expect(MAX_WRONG_CODES).toBe(5);
    expect(wrongCodesSinceReset(Array(4).fill(wrong()))).toBe(4);
    expect(wrongCodesSinceReset([...Array(4).fill(wrong()), { outcome: "denied:otp_reused", deviceHash: "d" }])).toBe(5);
    expect(wrongCodesSinceReset([wrong(), wrong(), { outcome: "allowed", deviceHash: "d" }, wrong()])).toBe(1);
    expect(wrongCodesSinceReset([...Array(5).fill(wrong()), { outcome: "locked", deviceHash: "d" }, wrong()])).toBe(1);
    // Wrong recipient IDs are not codes; they are slowed down by the rate limit instead.
    expect(wrongCodesSinceReset(Array(9).fill({ outcome: "denied:wrong_recipient", deviceHash: "d" }))).toBe(0);
  });

  it("lasts 15 minutes from the lock", () => {
    const past: PastAccess[] = [{ outcome: "locked", deviceHash: "d", at: new Date(T0).toISOString() }];
    expect(LOCK_MS).toBe(15 * 60_000);
    expect(lockedUntil(past, new Date(T0 + 60_000))).toBe(new Date(T0 + LOCK_MS).toISOString());
    expect(lockedUntil(past, new Date(T0 + LOCK_MS - 1))).not.toBeNull();
    expect(lockedUntil(past, new Date(T0 + LOCK_MS))).toBeNull();
    expect(lockedUntil([wrong()], new Date(T0))).toBeNull();
  });

  it("is read back from the access log, and the owner is alerted", async () => {
    const db = offlineClient(newStore()) as unknown as SupabaseClient;
    const key = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    const { tokenHash } = shareToken(key, "6f1c2a8e-0000-4000-8000-0000000000bb");
    const s = await createShare(db, { owner: "demo", recipientName: "Recipient", tokenHash, previewedAt: new Date(T0).toISOString(),
      draft: { recipient_code: "UV-R-1042", purpose: "job", fields: ["id_card.name"], expires_at: "2026-11-01T00:00:00.000Z", policy: { mode: "view_only" } },
      snapshot: { idem: "6f1c2a8e-0000-4000-8000-0000000000bb", docs: [] } });
    const base = { tokenId: s.tokenId, shareId: s.shareId, deviceHash: "d" };
    for (let i = 0; i < 5; i++) await logAccess(db, { ...base, outcome: "denied:wrong_code", notify: "wrong_code_attempt" });
    expect(wrongCodesSinceReset((await linkByTokenHash(db, tokenHash))!.past)).toBe(5);
    await logAccess(db, { ...base, outcome: "locked", notify: "share_locked" });

    const found = (await linkByTokenHash(db, tokenHash))!;
    const lockedAt = Date.parse(found.past.at(-1)!.at!);
    expect(lockedUntil(found.past, new Date(lockedAt + 60_000))).toBe(new Date(lockedAt + LOCK_MS).toISOString());
    expect(lockedUntil(found.past, new Date(lockedAt + LOCK_MS))).toBeNull();
    expect((await listNotifications(db, "demo")).filter((n) => n.kind === "share_locked")).toHaveLength(1);
  });
});
