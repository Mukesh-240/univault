/**
 * MANUAL-STYLE JOURNEY + FAULTS — what a person would click through, in a real browser, on whatever
 * database the app is connected to (the live Supabase project when .env.local has a real key):
 *   upload a scan -> correct an OCR field -> verify -> readiness -> confirm a name link ->
 *   create two shares -> recipient: wrong ID, wrong code, then correct -> owner sees the alert ->
 *   trace the watermark -> kill one link -> kill all -> ledger check.
 * Then the fault panel: each fault on -> the UI says what happened -> off -> it recovers.
 * A live database keeps everything from earlier runs, so "Add to vault" is only clicked if a scan is
 * still waiting to be stored.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

/** The verify button reads "Verify with issuer", "Verify again" or "Retry now" depending on the last result. */
const VERIFY = /^(Verify with issuer|Verify again|Retry now)$/;
const live = (page: Page) => page.locator("#live-region");
/** Open a page and wait until it is interactive (buttons rendered on the server only work once React has loaded). */
const go = async (page: Page, url: string) => { await page.goto(url);
  // React marks the elements it has taken over with __react* keys; the header bell is on every page.
  await page.waitForFunction(() => { const b = document.querySelector(".bell-btn"); return Boolean(b && Object.keys(b).some((k) => k.startsWith("__react"))); });
};

async function makeShare(page: Page, n: number) {
  await go(page, "/share");
  const select = page.getByLabel("Recipient (synthetic)");
  await select.selectOption((await select.locator("option").nth(n).getAttribute("value"))!);
  await page.getByRole("button", { name: "Preview what they will see" }).click();
  // The confirm answer carries the new share id; its card on /shares is #share-<id> (unique even when
  // a live database holds earlier shares for the same recipient).
  const [confirmed] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/share/confirm")), page.getByRole("button", { name: "Confirm and share" }).click({ timeout: 30_000 })]);
  const shareId = ((await confirmed.json()) as { receipt: { share_id: string } }).receipt.share_id;
  await expect(page.getByRole("heading", { name: "Share receipt" })).toBeVisible({ timeout: 30_000 });
  return {
    link: await page.getByLabel("Their personal link").inputValue(),
    recipientId: (await page.locator(".receipt dd code").first().innerText()).trim(),
    name: (await page.locator(".receipt dd").first().innerText()).trim(),
    shareId,
  };
}

/** A fresh device (its own cookies) opens the link and asks for a one-time code. */
async function askCode(browser: Browser, link: string, recipientId: string) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link);
  await p.getByLabel("Recipient ID").fill(recipientId);
  await p.getByRole("button", { name: "Send me a one-time code" }).click();
  return { ctx, p };
}
/** The SIMULATED code is shown on the gate page (no real SMS/email in the prototype). */
const shownCode = async (p: Page) => (await p.locator("[data-otp]").innerText()).trim();

test("journey: upload -> OCR fix -> verify -> readiness -> names -> share -> recipient -> alert -> trace -> kill -> kill all -> ledger", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const truth = JSON.parse(readFileSync("synthetic/out/labels/scans-ground-truth.json", "utf8")) as { scans: { file: string; fields: Record<string, string> }[] };

  // Upload: store the first scan through the normal upload route (if it isn't stored yet).
  const scan = truth.scans[0];
  const input = page.locator(`[id="ocr-${scan.file.replace("scans/", "")}-reg_no"]`);
  await go(page, "/ocr");
  if (!(await input.count())) {
    await page.getByRole("button", { name: "Add to vault" }).first().click();
    await expect(live(page)).toContainText("Added to your vault", { timeout: 30_000 });
  }

  // OCR correction: type the true value (from the ground-truth label, the test oracle) and save.
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(scan.fields.reg_no);
  await input.locator("xpath=ancestor::tr").getByRole("button", { name: "Save correction" }).click();
  await expect(live(page)).toContainText("corrected");

  // Verify one document with the issuer.
  await go(page, "/verify");
  const card = page.locator("li.card").first();
  await card.getByRole("button", { name: VERIFY }).click();
  await expect(card.locator(".verify-state .badge").first()).not.toHaveText("Not checked yet", { timeout: 30_000 });

  // Readiness and names.
  await go(page, "/readiness");
  await expect(page.locator("h1")).toHaveText("Readiness");
  await go(page, "/names");
  await page.getByRole("button", { name: "Confirm: same person" }).first().click();
  await expect(live(page)).toContainText("Recorded:");

  // Two shares; the recipient tries a wrong ID, then a wrong code, then the right code.
  const one = await makeShare(page, 0);
  const two = await makeShare(page, 1);
  const wrongId = await askCode(browser, one.link, "UV-R-0001");
  await expect(wrongId.p.getByRole("alert")).toContainText("don't match");
  const r = await askCode(browser, one.link, one.recipientId);
  const code = await shownCode(r.p);
  await r.p.getByLabel("One-time code").fill(code.slice(0, -1) + ((Number(code.slice(-1)) + 1) % 10));
  await r.p.getByRole("button", { name: "Open" }).click();
  await expect(r.p.getByRole("alert")).toContainText("don't match");
  await r.p.getByLabel("Recipient ID").fill(one.recipientId);
  await r.p.getByRole("button", { name: "Send me a one-time code" }).click();
  await r.p.getByLabel("One-time code").fill(await shownCode(r.p));
  await r.p.getByRole("button", { name: "Open" }).click();
  await expect(r.p.getByRole("heading", { name: "Shared with you" })).toBeVisible();
  const watermark = (await r.p.locator("[data-watermark]").innerText()).trim();

  // The owner sees the alerts.
  await go(page, "/shares");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.locator("#bell-panel")).toContainText("wrong recipient ID");

  // Trace the watermark.
  await go(page, "/leak-trace");
  await page.getByLabel("Watermark text").fill(watermark);
  await page.getByRole("button", { name: "Trace" }).click();
  await expect(live(page)).toContainText(`Traced to ${one.name}`);

  // Kill one link: it is denied, the other still opens.
  await go(page, "/shares");
  const card1 = page.locator(`#share-${one.shareId}`);
  await card1.getByRole("button", { name: "Kill this link" }).click();
  await expect(live(page)).toContainText("Access stopped");
  await r.p.goto(one.link);
  await expect(r.p.getByRole("heading", { name: "Access denied" })).toBeVisible();
  const other = await askCode(browser, two.link, two.recipientId);
  await other.p.getByLabel("One-time code").fill(await shownCode(other.p));
  await other.p.getByRole("button", { name: "Open" }).click();
  await expect(other.p.getByRole("heading", { name: "Shared with you" })).toBeVisible();

  // Kill all: the second link is now denied too.
  await go(page, "/shares");
  await page.getByRole("button", { name: "Kill all links" }).click();
  await expect(live(page)).toContainText("links stopped");
  await other.p.goto(two.link);
  await expect(other.p.getByRole("heading", { name: "Access denied" })).toBeVisible();

  // Ledger check.
  await go(page, "/ledger");
  await page.getByRole("button", { name: "Verify ledger now" }).click();
  await expect(live(page)).toContainText("Ledger intact");

  for (const c of [wrongId, r, other]) await c.ctx.close();
});

test("faults: each one on -> the UI says what happened -> off -> recovers", async ({ page }) => {
  test.setTimeout(240_000);
  const block = (title: string) => page.locator("section.panel").filter({ has: page.getByRole("heading", { name: title }) });
  const verifyFirst = async () => {
    await go(page, "/verify");
    const card = page.locator("li.card").first();
    await card.getByRole("button", { name: VERIFY }).click();
    return card;
  };

  // Issuer timeout: verification says "unreachable, retrying" (never a mismatch); off -> verifies again.
  await go(page, "/faults");
  await block("Issuer timeout").getByRole("button", { name: "Turn fault on" }).click();
  await expect(block("Issuer timeout")).toContainText("Issuer is now unreachable");
  let card = await verifyFirst();
  await expect(card.locator(".verify-state")).toContainText("Unverified", { timeout: 30_000 });
  await expect(card).toContainText(/Automatic retry 1 of 4/);
  await expect(card).not.toContainText("Doesn't match issuer record");
  await go(page, "/faults");
  await block("Issuer timeout").getByRole("button", { name: "Turn fault off" }).click();
  await expect(block("Issuer timeout")).toContainText("Issuer is reachable again");
  card = await verifyFirst();
  await expect(card.locator(".verify-state")).not.toContainText("Unverified", { timeout: 30_000 });

  // Stale data: earlier verifications are labelled stale; off -> the label goes away.
  await go(page, "/faults");
  await block("Stale data").getByRole("button", { name: "Turn fault on" }).click();
  await expect(block("Stale data")).toContainText("Earlier verifications are now stale");
  await go(page, "/verify");
  await expect(page.getByText("Stale: re-check before sharing").first()).toBeVisible();
  await go(page, "/faults");
  await block("Stale data").getByRole("button", { name: "Turn fault off" }).click();
  await expect(block("Stale data")).toContainText("normal 24-hour rule");
  await go(page, "/verify");
  await expect(page.getByText("Stale: re-check before sharing")).toHaveCount(0);

  // Malformed upload: refused with reasons, document count unchanged.
  await go(page, "/faults");
  await block("Malformed upload").getByRole("button", { name: "Send a malformed upload" }).click();
  await expect(block("Malformed upload").locator(".callout")).toContainText("Refused (HTTP 400)");
  const m = (await block("Malformed upload").locator(".callout").innerText()).match(/before: (\d+), after: (\d+)/);
  expect(m?.[1]).toBe(m?.[2]);

  // Conflicting update: the issuer publishes v+1; verification names the changed field.
  // Recovery: issuer records are append-only, so the issuer publishes ANOTHER version with the original
  // value (read from the document's own dataset file), and the document verifies again. This runs in
  // `finally` so a failed step never leaves a live database with a changed issuer record.
  const cu = block("Conflicting update from the issuer");
  const docId = await page.locator("#cu-doc").inputValue();
  const title = (await page.locator("#cu-doc option:checked").innerText()).trim();
  const field = await page.locator("#cu-field").inputValue();
  const dataset = JSON.parse(readFileSync("synthetic/out/data/dataset-showcase.json", "utf8")) as { documents: { title: string; fields: Record<string, string> }[] };
  const original = dataset.documents.find((d) => d.title === title)?.fields[field];
  expect(original, `original ${field} of "${title}"`).toBeTruthy();
  const changed = page.locator(`[id="v-${docId}"]`);
  try {
    await page.getByLabel("New value at the issuer").fill("ISSUER-UPDATED-VALUE");
    await cu.getByRole("button", { name: "Publish issuer update" }).click();
    await expect(cu).toContainText(/The issuer published version \d+/);
    await go(page, "/verify");
    await changed.getByRole("button", { name: VERIFY }).click();
    await expect(changed).toContainText(/The issuer published version \d+\. Your copy matches version \d+/, { timeout: 30_000 });
  } finally {
    const restore = await page.request.post("/api/faults", { data: { fault: "conflicting_update", document_id: docId, field, value: original } });
    expect(restore.ok()).toBe(true);
  }
  await go(page, "/verify");
  await changed.getByRole("button", { name: VERIFY }).click();
  await expect(changed.locator(".verify-state .badge").first()).toHaveText("Verified", { timeout: 30_000 });

  // Connectivity loss: buttons refuse to send and say so; off -> they work again.
  await go(page, "/faults");
  const conn = block("Connectivity loss");
  await conn.getByRole("button", { name: "Turn fault on" }).click();
  await block("Malformed upload").getByRole("button", { name: "Send a malformed upload" }).click();
  await expect(block("Malformed upload")).toContainText("You are offline. Nothing was sent");
  await conn.getByRole("button", { name: "Turn fault off" }).click();
  await expect(conn).toContainText("Back online");
  await block("Malformed upload").getByRole("button", { name: "Send a malformed upload" }).click();
  await expect(block("Malformed upload")).toContainText("Refused (HTTP 400)");
});
