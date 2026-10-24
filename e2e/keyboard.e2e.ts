/**
 * KEYBOARD-ONLY WALKS — two journeys without touching the mouse. Only Tab, Enter, arrows and typing.
 *   1. Home -> Am I ready? -> Are these the same person? (answer Yes) -> Scan and fix (add a scan, fix a field).
 *   2. The SHARE WIZARD, start to finish: who -> what -> how long -> review -> "Share now" -> receipt.
 * tabTo() presses Tab until the wanted control has focus, the way a keyboard user would. Each step also
 * checks that the change was announced in the live region. The correct value typed into the scan field
 * comes from the ground-truth label file (the test oracle).
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const MAX_TABS = 500;

/** Press Tab until the focused element matches `selector` (and contains `text`, if given). */
async function tabTo(page: Page, selector: string, text?: string) {
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate(({ s, txt }) => {
      const a = document.activeElement;
      return Boolean(a && a.matches(s) && (!txt || (a.textContent ?? "").includes(txt)));
    }, { s: selector, txt: text });
    if (hit) return;
  }
  throw new Error(`Could not reach ${selector} ${text ?? ""} with the keyboard`);
}

const live = (page: Page) => page.locator("#live-region");
/** Wait until React has taken over the page (buttons only work after that). */
const ready = (page: Page) => page.waitForFunction(() => { const b = document.querySelector(".bell-btn"); return Boolean(b && Object.keys(b).some((k) => k.startsWith("__react"))); });

test("keyboard only: home -> am I ready? -> same person? yes -> scan and fix a field", async ({ page }) => {
  const truth = JSON.parse(readFileSync("synthetic/out/labels/scans-ground-truth.json", "utf8")) as { scans: { file: string; fields: Record<string, string> }[] };
  await page.goto("/");
  await ready(page);
  await expect(page.locator("h1")).toContainText("Namaste");

  // The first Tab reaches the skip link.
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Skip to main content");

  // Home -> Am I ready? through the menu; the focus ring must be visible.
  await tabTo(page, 'a[href="/readiness"]');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/readiness$/);
  await expect(page.locator("h1")).toHaveText("Am I ready?");

  // Am I ready? -> Are these the same person?; answer Yes for the best-ranked pair.
  await tabTo(page, 'a[href="/names"]');
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/names$/);
  await tabTo(page, ".decision button", "Yes, same person");
  await page.keyboard.press("Enter");
  await expect(live(page)).toContainText("Saved:");
  await expect(page.locator(".decision-current").first()).toHaveText("Your answer: same person");

  // -> Scan and fix; add the first scan if needed, then fix one field.
  await tabTo(page, 'a[href="/ocr"]');
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ocr$/);
  const scan = truth.scans[0];
  const name = scan.file.replace("scans/", "");
  const input = `[id="ocr-${name}-reg_no"]`;
  if (!(await page.locator(input).count())) {
    await tabTo(page, "button", "Add to my documents");
    await page.keyboard.press("Enter");
    await expect(live(page)).toContainText("Added to your documents");
    await expect(page.locator(input)).toBeVisible();
  }
  await tabTo(page, input);
  await page.keyboard.press("Tab"); // -> "This is correct"
  await page.keyboard.press("Tab"); // -> "Let me fix it"
  await expect(page.locator(":focus")).toHaveText("Let me fix it");
  await page.keyboard.press("Enter"); // the box opens for typing and takes the focus
  await expect(page.locator(input)).toBeFocused();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(scan.fields.reg_no);
  await page.keyboard.press("Tab"); // -> "Save my fix"
  await expect(page.locator(":focus")).toHaveText("Save my fix");
  await page.keyboard.press("Enter");
  await expect(live(page)).toContainText("fixed");
  await expect(page.locator(input).locator("xpath=ancestor::li[1]")).toContainText(/Fixed by you|Confirmed by you/);
});

test("keyboard only: the share wizard from who to receipt", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/share");
  await ready(page);
  await expect(page.getByRole("heading", { name: "Who is asking?" })).toBeVisible();

  // Step 1: the first recipient is already chosen; Next.
  await tabTo(page, "button", "Next");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "What do they need?" })).toBeVisible();
  // Step 2: only what the request needs is ticked; Next.
  await tabTo(page, "button", "Next");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "For how long?" })).toBeVisible();
  // Step 3: 7 days and "only look" are already chosen; use the arrow keys to pick 30 days, then review.
  await tabTo(page, 'input[name="days"]:checked');
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#days-30")).toBeChecked();
  await tabTo(page, "button", "Review what they will see");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Review and send" })).toBeVisible({ timeout: 60_000 });
  // Step 4: Back is always there; then send.
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await tabTo(page, "button", "Share now");
  const [confirmed] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/share/confirm")), page.keyboard.press("Enter")]);
  const shareId = ((await confirmed.json()) as { receipt: { share_id: string } }).receipt.share_id;
  await expect(page.getByRole("heading", { name: "Your share is ready" })).toBeVisible({ timeout: 60_000 });
  // Clean up (not part of the journey): stop the throwaway link so the live data stays tidy.
  expect((await page.request.post("/api/shares/kill", { data: { share_id: shareId } })).ok()).toBe(true);
});
