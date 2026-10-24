/**
 * PHASE 9 / P0 — LOOPHOLE REGRESSIONS. Each group fails if the matching protection is removed:
 *   P0.1  every route and page is classified: signed out is refused everywhere except the public list; an issuer, a
 *         sender and a receiver can each open only their own area (pages go to "This area is for ...", APIs get 403);
 *   P0.3  a share cannot be confirmed without a preview, with another share preview, after the share changed, or after
 *         the preview expired;
 *   P0.2  a link that is dead (stopped, expired, over its views), a wrong recipient and a replayed one-time code are
 *         all refused;
 *   P0.11 a session cookie cannot be forged or promoted by editing it.
 * (P0.7 log scrub, P0.9 wording and P0.10 ledger coverage are in tests/p0-source-scans.test.ts.)
 */
import { generateKeyPairSync } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { checkConfirmation, previewToken, type ShareDraft } from "../src/lib/consent";
import { gateFor, isPublicPath } from "../src/lib/gate";
import { cookieOptions, open, seal, type SessionPayload } from "../src/lib/session";
import { decideCodeRequest, decideOpen, hashCode, type LinkFacts } from "../src/lib/shares";

const SRC = join(__dirname, "..", "src");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const FILES = walk(SRC);
const addr = (file: string) => "/" + relative(join(SRC, "app"), file).split(sep).join("/").replace(/\/?(route|page)\.tsx?$/, "").replace(/\[[a-zA-Z]+\]/g, "x");

const ROUTES = FILES.filter((f) => /app[\\/].*route\.ts$/.test(f)).map(addr);
const PAGES = FILES.filter((f) => /app[\\/].*page\.tsx$/.test(f)).map(addr);

describe("P0.1 every route and page is guarded by its area", () => {
  it("finds the routes (so this test cannot pass by looking at nothing)", () => { expect(ROUTES.length).toBeGreaterThan(30); expect(PAGES.length).toBeGreaterThan(20); });
  it("signed out: everything is refused except the public list", () => {
    for (const p of [...ROUTES, ...PAGES]) {
      const g = gateFor(p, null);
      if (isPublicPath(p)) expect(g, p).toBe("allow");
      else expect(g, p).toBe(p.startsWith("/api/") ? "unauthorized" : "signin");
    }
  });
  it("an issuer reaches only the issuer area; a receiver only the receiving area; a sender everything except the issuer area", () => {
    for (const p of [...ROUTES, ...PAGES]) {
      if (isPublicPath(p) || p === "/area") continue;
      const inIssuer = p.startsWith("/issuer") || p.startsWith("/api/issuer-portal");
      const inReceive = p.startsWith("/receive") || p.startsWith("/api/receive");
      const ok = (role: "issuer" | "receiver" | "sender") => ["allow", "redirect"].includes(gateFor(p, role));
      expect(ok("issuer"), `issuer ${p}`).toBe(inIssuer || p === "/");
      expect(ok("receiver"), `receiver ${p}`).toBe(inReceive || p === "/");
      expect(ok("sender"), `sender ${p}`).toBe(!inIssuer);
    }
  });
  it("the issuer and receiver API handlers also check the role themselves (defence in depth)", () => {
    for (const f of FILES.filter((x) => /api[\\/](issuer-portal|receive)[\\/].*route\.ts$/.test(x))) expect(readFileSync(f, "utf8"), f).toMatch(/currentSession|receiverCode/);
  });
});

describe("P0.3 confirmation is tied to the preview", () => {
  const k = generateKeyPairSync("ed25519");
  const priv = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const pub = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const draft: ShareDraft = { recipient_code: "UV-R-1000", purpose: "job", fields: ["a.b"], expires_at: "2026-11-01T00:00:00.000Z", policy: { mode: "view_only" } };
  const now = new Date("2026-10-25T10:00:00Z");
  it("no preview token: refused", () => expect(checkConfirmation(draft, null, pub, now).ok).toBe(false));
  it("a token for a different share: refused", () => expect(checkConfirmation(draft, previewToken({ ...draft, fields: ["a.c"] }, priv, now), pub, now).ok).toBe(false));
  it("a token signed by someone else: refused", () => expect(checkConfirmation(draft, previewToken(draft, priv, now), other, now).ok).toBe(false));
  it("a share changed after the preview, or an expired preview: refused; the exact share: accepted", () => {
    const t = previewToken(draft, priv, now);
    expect(checkConfirmation({ ...draft, purpose: "scholarship" }, t, pub, now).ok).toBe(false);
    expect(checkConfirmation(draft, t, pub, new Date(now.getTime() + 11 * 60_000)).ok).toBe(false);
    expect(checkConfirmation(draft, t, pub, now).ok).toBe(true);
  });
  it("the confirm route looks up a first share made with the same idempotency key (no duplicate)", () => {
    const src = readFileSync(join(SRC, "app", "api", "share", "confirm", "route.ts"), "utf8");
    expect(src).toMatch(/hashIdempotencyKey/);
    expect(src).toMatch(/verification_snapshot->>idem/);
  });
});

describe("P0.2 dead, wrong and replayed links are refused", () => {
  const link: LinkFacts = { shareRevoked: false, tokenKilled: false, expiresAt: "2026-11-01T00:00:00.000Z", recipientCode: "UV-R-1000", policy: "view_only" };
  const now = new Date("2026-10-25T10:00:00Z");
  const at = { recipientId: "UV-R-1000", deviceHash: "d1", now };
  it("stopped, killed, expired, unknown and wrong-recipient links give no code", () => {
    expect(decideCodeRequest({ ...link, shareRevoked: true }, at).outcome).toBe("denied:revoked");
    expect(decideCodeRequest({ ...link, tokenKilled: true }, at).outcome).toBe("denied:killed");
    expect(decideCodeRequest({ ...link, expiresAt: "2026-10-24T00:00:00.000Z" }, at).outcome).toBe("denied:expired");
    expect(decideCodeRequest(null, at).outcome).toBe("denied:unknown_link");
    expect(decideCodeRequest(link, { ...at, recipientId: "UV-R-2000" }).outcome).toBe("denied:wrong_recipient");
  });
  it("a one-time code works once; a replay is refused; the view limit is enforced", () => {
    const issued = { outcome: "code_issued", deviceHash: "d1", codeHash: hashCode("123456"), at: now.toISOString() };
    expect(decideOpen(link, { ...at, code: "123456" }, [issued]).outcome).toBe("allowed");
    const used = [issued, { outcome: "allowed", deviceHash: "d1", codeHash: hashCode("123456") }];
    expect(decideOpen(link, { ...at, code: "123456" }, used).outcome).toBe("denied:otp_reused");
    expect(decideOpen({ ...link, maxViews: 1 }, { ...at, code: "123456" }, [issued, { outcome: "allowed", deviceHash: "d1", codeHash: "x" }]).outcome).toBe("denied:max_views");
  });
});

describe("P0.11 the session cookie cannot be edited", () => {
  const SECRET = "p0-test-secret-key-value";
  const base: SessionPayload = { kind: "session", last4: "1234", name: "A", role: "sender", ref: "demo", iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 };
  it("changing the role inside a signed cookie invalidates it", async () => {
    const token = await seal(base, SECRET);
    expect(await open<SessionPayload>(token, "session", SECRET)).toMatchObject({ role: "sender" });
    const [body, sig] = token.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString());
    forged.role = "issuer";
    expect(await open<SessionPayload>(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, "session", SECRET)).toBeNull();
    expect(await open<SessionPayload>(token, "session", "another-secret")).toBeNull();
    expect(await open<SessionPayload>(await seal({ ...base, exp: 1 }, SECRET), "session", SECRET)).toBeNull();
  });
  it("the cookie is HttpOnly, SameSite=Lax and Secure on https", () => {
    expect(cookieOptions(60, true)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  });
  it("the role comes only from the signed cookie: the middleware never reads a query string", () => {
    const mw = readFileSync(join(SRC, "middleware.ts"), "utf8");
    expect(mw).not.toMatch(/searchParams/);
    expect(mw).toMatch(/open<SessionPayload>/);
  });
});
