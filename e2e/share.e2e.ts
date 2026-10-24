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
  const select = page.getByLabel("Recipient (synthetic)");
  const value = await select.locator("option").nth(n).getAttribute("value");
  await select.selectOption(value!);
  await page.getByRole("button", { name: "Preview what they will see" }).click();
  await expect(page.getByRole("heading", { name: /^Preview: what/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Exactly what they will see (watermark sample)" })).toBeVisible();
  // The confirm answer carries the new share id; its card on /shares is #share-<id> (unique even when
  // a live database holds earlier shares for the same recipient).
  const [confirmed] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/share/confirm")), page.getByRole("button", { name: "Confirm and share" }).click()]);
  const shareId = ((await confirmed.json()) as { receipt: { share_id: string } }).receipt.share_id;
  await expect(page.getByRole("heading", { name: "Share receipt" })).toBeVisible({ timeout: 30_000 });
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
  await page.getByRole("button", { name: /^Notifications/ }).click();
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
  await card1.getByRole("button", { name: "Kill this link" }).click();
  await expect(page.locator("#live-region")).toContainText("Access stopped");
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
  await page.getByRole("button", { name: "Verify ledger now" }).click();
  await expect(page.locator("#live-region")).toContainText("Ledger intact");

  // 8. Erase a document: limits shown first, explicit acknowledgement, then erase.
  //    A throwaway document is uploaded first (through the normal upload route) and erased, so running
  //    this test against a live database never erases the demo documents.
  const title = `Erase test ${Date.now()}`;
  const up = await page.request.post("/api/upload", { data: { owner: "demo", doc_type: "reference_letter", title, issuer: null, serial: null,
    capture: "digital", fields: { note: "throwaway document for the erase test" }, synthetic: true } });
  expect(up.status()).toBe(201);
  await page.goto("/");
  const firstCard = page.locator("li.card").filter({ has: page.getByRole("heading", { name: title }) });
  await firstCard.getByRole("button", { name: "Erase this document…" }).click();
  await expect(firstCard.getByText("Copies a recipient already downloaded cannot be recalled.")).toBeVisible();
  await firstCard.getByLabel("I understand these limits").check();
  await firstCard.getByRole("button", { name: `Erase "${title}" permanently` }).click();
  await expect(page.locator("#live-region")).toContainText("erased");
  await expect(page.getByRole("heading", { name: "Erased documents" })).toBeVisible();

  for (const c of [devA, devB, stranger, other]) await c.ctx.close();
});
