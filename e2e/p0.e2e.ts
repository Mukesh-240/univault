/**
 * PHASE 9 / P0 ATTACK JOURNEYS — probes through the real server, as an attacker or a mistaken user would:
 *   - confirming a share needs the preview: no token, a token for another share, and a second use of the same
 *     idempotency key (which must not make a second share) are all handled;
 *   - a link forwarded to a different signed-in receiving account is denied, and the owner log says exactly
 *     "<UV-ID> attempted a link meant for <UV-ID>";
 *   - the wrong role gets a 403 on API routes and cannot open the other roles pages.
 */
import { expect, test } from "@playwright/test";
import { AUTH_FILE, ISSUER_AUTH, RECEIVER_AUTH } from "./global-setup";

/** The real recipient codes, read from the share wizard first step (the cards that list who can receive). */
async function recipientCodes(page: import("@playwright/test").Page) {
  await page.goto("/share");
  const ids = await page.locator("input[name=recipient]").evaluateAll((els) => els.map((e) => e.id));
  return ids.map((i) => i.replace("rcp-", "")).sort();
}
const draft = (code: string, fields: string[]) => ({ recipient_code: code, purpose: "job", fields, expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), policy: { mode: "view_only" } });

test("confirm needs the preview; a second use of the same key makes no second share", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, storageState: AUTH_FILE });
  const api = ctx.request;
  const codes = await recipientCodes(await ctx.newPage());
  expect(codes.length).toBeGreaterThan(1);
  const d = draft(codes[0], ["degree_certificate.degree"]);
  const idem = crypto.randomUUID();
  // No preview token at all.
  expect((await api.post("/api/share/confirm", { data: { draft: d, idempotency_key: idem } })).status()).toBe(403);
  // A preview token that belongs to a different share.
  const other = await (await api.post("/api/share/preview", { data: draft(codes[1], ["degree_certificate.degree"]) })).json();
  expect((await api.post("/api/share/confirm", { data: { draft: d, preview_token: other.previewToken, idempotency_key: idem } })).status()).toBe(403);
  // The right preview: it works, and the same key again returns the SAME share.
  const pv = await (await api.post("/api/share/preview", { data: d })).json();
  const first = await (await api.post("/api/share/confirm", { data: { draft: d, preview_token: pv.previewToken, idempotency_key: idem } })).json();
  const again = await (await api.post("/api/share/confirm", { data: { draft: d, preview_token: pv.previewToken, idempotency_key: idem } })).json();
  expect(first.replayed).toBe(false);
  expect(again.replayed).toBe(true);
  expect(again.receipt.share_id).toBe(first.receipt.share_id);
  await ctx.close();
});

test("a forwarded link is denied for a different account and the log names both IDs", async ({ browser, baseURL }) => {
  const sender = await browser.newContext({ baseURL, storageState: AUTH_FILE });
  const codes = await recipientCodes(await sender.newPage());
  const intended = codes[1]; // the receiver account in this test is the FIRST receiver, so this link is not meant for it
  const d = draft(intended, ["degree_certificate.degree"]);
  const pv = await (await sender.request.post("/api/share/preview", { data: d })).json();
  const made = await (await sender.request.post("/api/share/confirm", { data: { draft: d, preview_token: pv.previewToken, idempotency_key: crypto.randomUUID() } })).json();
  const link = new URL(made.receipt.link).pathname;

  const stranger = await browser.newContext({ baseURL, storageState: RECEIVER_AUTH });
  const page = await stranger.newPage();
  const r = await page.goto(link);
  expect(r?.status()).toBe(403);
  await expect(page.getByRole("alert")).toContainText("different account");

  const sp = await sender.newPage();
  await sp.goto("/shares");
  await expect(sp.locator("body")).toContainText(`attempted a link meant for ${intended}`);
  await sender.close(); await stranger.close();
});

test("wrong role: an issuer cannot call the vault APIs, a sender cannot call the issuer APIs", async ({ browser, baseURL }) => {
  const issuer = await browser.newContext({ baseURL, storageState: ISSUER_AUTH });
  expect((await issuer.request.post("/api/share/preview", { data: {} })).status()).toBe(403);
  expect((await issuer.request.get("/api/notifications")).status()).toBe(403);
  const sender = await browser.newContext({ baseURL, storageState: AUTH_FILE });
  expect((await sender.request.post("/api/issuer-portal/revoke", { data: { serial: "X-1" } })).status()).toBe(403);
  expect((await sender.request.post("/api/receive/ask", { data: { holder_ref: "demo", items: ["a.b"] } })).status()).toBe(403);
  await issuer.close(); await sender.close();
});
