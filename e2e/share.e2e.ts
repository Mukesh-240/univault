/**
 * PHASE 4 SCENARIO — the headline demo, end to end in a real browser:
 *   create a share (preview -> confirm -> receipt) and a second share for another recipient ->
 *   the recipient opens link 1 (ID + simulated one-time code) and sees the watermarked view ->
 *   the same recipient opens it from a SECOND device (owner notified: new device) ->
 *   a stranger tries link 1 with a wrong ID (denied, owner notified) ->
 *   leak trace resolves the watermark text to the recipient and session ->
 *   kill link 1 only ("Test this link now" says denied; the link really is denied) ->
 *   link 2 still works -> "Verify ledger" says intact -> erase a document (limits shown first).
 * Each "device" is a separate browser context (its own cookies), like a second phone.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

interface Made { link: string; recipientId: string; name: string; shareId: string }

/** Owner: build and confirm a share for the n-th recipient in the list. */
async function makeShare(page: Page, n: number): Promise<Made> {
  await page.goto("/share");
  await page.locator(".radio-card").nth(n).click(); // step 1: who
  await page.getByRole("button", { name: "Next" }).click(); // step 2: what (only what the request needs is ticked)
  await page.getByRole("button", { name: "Next" }).click(); // step 3: how long
  await page.getByRole("button", { name: "Review what they will see" }).click(); // step 4: review
  await expect(page.getByRole("heading", { name: "Review and send" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Exactly what they will see (watermark sample)" })).toBeVisible();
  // The confirm answer carries the new share id; its card on /shares is #share-<id> (unique even when
  // a live database holds earlier shares for the same recipient).
  const [confirmed] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/share/confirm")), page.getByRole("button", { name: /^Share with / }).click()]);
  const shareId = ((await confirmed.json()) as { receipt: { share_id: string } }).receipt.share_id;
  await expect(page.getByRole("heading", { name: "Your share is ready" })).toBeVisible({ timeout: 30_000 });
  const link = await page.getByLabel("Their personal link").inputValue();
  const recipientId = (await page.locator(".receipt dd code").first().innerText()).trim();
  const name = (await page.locator(".receipt dd").first().innerText()).trim();
  return { link, recipientId, name, shareId };
}

/** A recipient on a fresh device: ask for a code, read the SIMULATED code off the screen, open. */
async function openAs(browser: Browser, link: string, recipientId: string) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link);
  await p.getByLabel("Recipient ID").fill(recipientId);
  await p.getByRole("button", { name: "Send me a one-time code" }).click();
  return { ctx, p };
}

async function enterCode(p: Page) {
  const code = (await p.locator("[data-otp]").innerText()).trim();
  await p.getByLabel("One-time code").fill(code);
  await p.getByRole("button", { name: "Open" }).click();
}

const notifications = async (page: Page) => (await (await page.request.get("/api/notifications")).json()).notifications as { kind: string }[];

test("share -> gate + watermark -> second device -> stranger denied -> leak trace -> kill one -> other works -> ledger -> erase", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const one = await makeShare(page, 0);
  const two = await makeShare(page, 1);
  expect(one.recipientId).toMatch(/^UV-R-\d+$/);
  expect(two.recipientId).not.toBe(one.recipientId);

  // 1. The recipient opens link 1 on device A: gate, then the watermarked minimal view.
  const devA = await openAs(browser, one.link, one.recipientId);
  await expect(devA.p.getByText("SIMULATED", { exact: false }).first()).toBeVisible();
  await enterCode(devA.p);
  await expect(devA.p.getByRole("heading", { name: "Shared with you" })).toBeVisible();
  const watermark = (await devA.p.locator("[data-watermark]").innerText()).trim();
  expect(watermark).toContain(one.recipientId);
  expect(await devA.p.evaluate(() => getComputedStyle(document.body).backgroundImage)).toContain("data:image/svg+xml");
  expect(await devA.p.locator("script[src]").count()).toBe(0);

  // 2. Same recipient, second device -> allowed, owner notified (new device).
  const devB = await openAs(browser, one.link, one.recipientId);
  await enterCode(devB.p);
  await expect(devB.p.getByRole("heading", { name: "Shared with you" })).toBeVisible();

  // 3. A stranger with the forwarded link but a wrong ID -> denied, owner notified.
  const stranger = await openAs(browser, one.link, "UV-R-0001");
  await expect(stranger.p.getByRole("alert")).toContainText("don't match");
  const kinds = (await notifications(page)).map((n) => n.kind);
  expect(kinds).toEqual(expect.arrayContaining(["first_open", "new_device", "wrong_recipient_attempt"]));
  await page.goto("/shares");
  await page.getByRole("button", { name: /^Alerts/ }).click();
  await expect(page.locator("#bell-panel")).toContainText("wrong recipient ID");

  // 4. Leak trace: the text read off the watermark resolves to the recipient and that session.
  await page.goto("/leak-trace");
  await page.getByLabel("Watermark text").fill(watermark);
  await page.getByRole("button", { name: "Trace" }).click();
  await expect(page.locator("#live-region")).toContainText(`Traced to ${one.name}`);
  await expect(page.getByRole("region").or(page.locator("section")).last()).toContainText(one.recipientId);

  // 5. Kill link 1 only; "Test this link now" says denied, and the link really is denied.
  await page.goto("/shares");
  const card1 = page.locator(`#share-${one.shareId}`);
  await card1.getByRole("button", { name: "Stop sharing" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click(); // the confirm sentence, then the choice
  await expect(page.locator("#live-region")).toContainText("Sharing stopped");
  await card1.getByRole("button", { name: "Test this link now" }).click();
  await expect(card1.locator(".test-result")).toContainText("Denied: the owner stopped this share.");
  await devA.p.goto(one.link);
  await expect(devA.p.getByRole("heading", { name: "Access denied" })).toBeVisible();

  // 6. The other share still works.
  const other = await openAs(browser, two.link, two.recipientId);
  await enterCode(other.p);
  await expect(other.p.getByRole("heading", { name: "Shared with you" })).toBeVisible();

  // 7. Verify ledger.
  await page.goto("/ledger");
  await page.getByRole("button", { name: "Check the history now" }).click();
  await expect(page.locator("#live-region")).toContainText("History intact");

  // 8. Erase a document: limits shown first, explicit acknowledgement, then erase.
  //    A throwaway document is uploaded first (through the normal upload route) and erased, so running
  //    this test against a live database never erases the demo documents.
  const title = `Erase test ${Date.now()}`;
  const up = await page.request.post("/api/upload", { data: { owner: "demo", doc_type: "reference_letter", title, issuer: null, serial: null,
    capture: "digital", fields: { note: "throwaway document for the erase test" }, synthetic: true } });
  expect(up.status()).toBe(201);
  const docId = ((await up.json()) as { id: string }).id;
  await page.goto(`/doc/${docId}`);
  await page.getByRole("button", { name: "Erase this document…" }).click();
  await expect(page.getByText("Copies a recipient already downloaded cannot be recalled.")).toBeVisible();
  await page.getByLabel("I understand these limits").check();
  await page.getByRole("button", { name: `Erase "${title}" permanently` }).click();
  await expect(page.locator("#live-region")).toContainText("erased");
  await page.goto("/documents");
  await page.locator("details.expert", { hasText: "Checks across your documents" }).locator("summary").click();
  await expect(page.getByRole("heading", { name: "Erased documents" })).toBeVisible();

  for (const c of [devA, devB, stranger, other]) await c.ctx.close();
});

test("five wrong codes lock the link for 15 minutes (429), even the right code is refused, owner told", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const made = await makeShare(page, 2);
  const { ctx, p } = await openAs(browser, made.link, made.recipientId);
  const real = (await p.locator("[data-otp]").innerText()).trim();
  const bad = real === "000000" ? "111111" : "000000";
  // The same browser (same device cookie) submits the gate form, as the Open button would.
  const open = (code: string) => p.request.post(made.link, { form: { step: "open", recipient_id: made.recipientId, code } });
  for (let i = 1; i <= 4; i++) expect((await open(bad)).status(), `wrong code ${i}`).toBe(403);
  const fifth = await open(bad);
  expect(fifth.status()).toBe(429);
  expect(Number(fifth.headers()["retry-after"])).toBeGreaterThan(14 * 60);
  expect(await fifth.text()).toContain("Locked");

  // Even the right code is refused while locked, and the gate page itself says so.
  expect((await open(real)).status()).toBe(429);
  await p.goto(made.link);
  await expect(p.getByRole("alert")).toContainText("Locked");
  expect((await notifications(page)).map((n) => n.kind)).toContain("share_locked");
  await ctx.close();
});
