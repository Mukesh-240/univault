/**
 * PHASE 9 JOURNEYS — the new features through the real screens:
 *   - an eligibility check: the receiver asks, the holder authorises ONE criterion, the answer arrives signed, says
 *     "under these criteria" (never "eligible"), says it is not proof, and shows no document;
 *   - a request is declined: logged, and the receiver sees "Declined";
 *   - kill user: every link to one recipient stops, the receiver is told neutrally, "Test this link now" shows it
 *     denied, and a leak trace still resolves the watermark of a link that was opened before it was stopped.
 */
import { expect, test } from "@playwright/test";
import { AUTH_FILE, RECEIVER_AUTH } from "./global-setup";

test("eligibility: ask, authorise one criterion, signed answer, no documents", async ({ browser, baseURL }) => {
  const r = await (await browser.newContext({ baseURL, storageState: RECEIVER_AUTH, reducedMotion: "reduce" })).newPage();
  const s = await (await browser.newContext({ baseURL, storageState: AUTH_FILE, reducedMotion: "reduce" })).newPage();
  await r.goto("/receive/eligibility");
  await expect(r.getByText("Agreeing to this check does not share any document.")).toBeVisible();
  await r.locator(".profile-card").first().click();
  await r.getByRole("button", { name: "Send eligibility request" }).click();
  await expect(r.locator("#main").getByText(/Request sent\./)).toBeVisible();

  await s.goto("/alerts");
  await expect(s.getByRole("heading", { name: "Eligibility checks asked of you" })).toBeVisible();
  const card = s.locator("li.card").filter({ hasText: "criteria for" }).first();
  await card.locator("input[type=checkbox]").first().check();
  await card.getByRole("button", { name: "Run the check and send the result" }).click();
  await expect(s.locator("#main").getByText("Answered.").first()).toBeVisible();

  await r.goto("/receive/eligibility");
  const answered = r.locator("li.card").filter({ hasText: "Answered" }).first();
  await expect(answered).toContainText(/under these criteria/);
  await expect(answered).toContainText("It is not proof");
  await expect(answered).toContainText("Signature checked: valid");
  await expect(answered).not.toContainText(/eligible/i);
  await expect(answered.locator(".chip").nth(1)).toContainText(/Met|Not met|Unknown/);
});

test("a declined request is logged and the receiver sees Declined", async ({ browser, baseURL }) => {
  const r = await (await browser.newContext({ baseURL, storageState: RECEIVER_AUTH, reducedMotion: "reduce" })).newPage();
  const s = await (await browser.newContext({ baseURL, storageState: AUTH_FILE, reducedMotion: "reduce" })).newPage();
  await r.goto("/receive/ask");
  await r.locator(".profile-card").first().click();
  await r.locator("fieldset input[type=checkbox]").first().check();
  await r.getByRole("button", { name: "Send request" }).click();
  await expect(r.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await s.goto("/alerts");
  await s.locator("li.card").filter({ hasText: "asks for" }).first().getByRole("button", { name: "Decline" }).click();
  await expect(s.locator("li.card").filter({ hasText: "asks for" }).first()).toContainText("Declined");
  await r.goto("/receive/requests");
  await expect(r.locator("li.card").filter({ hasText: "Declined" }).first()).toBeVisible();
});

test("kill user: links to one recipient stop, neutral notice, test link denied, leak trace still resolves", async ({ browser, baseURL }) => {
  const sender = await browser.newContext({ baseURL, storageState: AUTH_FILE });
  const rcv = await browser.newContext({ baseURL, storageState: RECEIVER_AUTH, reducedMotion: "reduce" });
  const page = await sender.newPage();
  await page.goto("/share");
  const codes = (await page.locator("input[name=recipient]").evaluateAll((els) => els.map((e) => e.id.replace("rcp-", "")))).sort();
  const draft = { recipient_code: codes[0], purpose: "job", fields: ["degree_certificate.degree"], expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), policy: { mode: "view_only" } };
  const pv = await (await sender.request.post("/api/share/preview", { data: draft })).json();
  const made = await (await sender.request.post("/api/share/confirm", { data: { draft, preview_token: pv.previewToken, idempotency_key: crypto.randomUUID() } })).json();
  const shareId: string = made.receipt.share_id;

  const r = await rcv.newPage();
  await r.goto(`/receive/${shareId}`);
  const mark = (await r.locator("[data-watermark]").innerText()).trim();

  const killed = await (await sender.request.post("/api/shares/kill", { data: { recipient_code: codes[0] } })).json();
  expect(killed.killed).toContain(shareId);
  await r.goto(`/receive/${shareId}`);
  await expect(r.getByRole("heading", { name: "Access to this document was ended by the owner." })).toBeVisible();
  const test = await (await sender.request.post("/api/shares/test", { data: { share_id: shareId } })).json();
  expect(test.result).not.toBe("active");
  const trace = await (await sender.request.post("/api/leak-trace", { data: { text: mark } })).json();
  expect(JSON.stringify(trace)).toContain(codes[0]);
  await sender.close(); await rcv.close();
});
