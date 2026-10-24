/**
 * KEYBOARD-ONLY WALK — the whole main flow without touching the mouse:
 *   vault -> readiness -> name detective (confirm a name link) -> OCR (store a scan, correct a field).
 * Only Tab, Enter and typing are used. tabTo() presses Tab until the wanted control has focus, the way
 * a keyboard user would. Each step also checks that the status change was announced in the live region.
 * The correct value typed into the OCR field comes from the ground-truth label file (the test oracle).
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const MAX_TABS = 400;

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

test("keyboard only: vault -> readiness -> confirm a name link -> correct an OCR field", async ({ page }) => {
  const truth = JSON.parse(readFileSync("synthetic/out/labels/scans-ground-truth.json", "utf8")) as { scans: { file: string; fields: Record<string, string> }[] };
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Your vault");

  // The first Tab reaches the skip link.
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText("Skip to main content");

  // Vault -> Readiness through the navigation; the focus ring must be visible.
  await tabTo(page, 'a[href="/readiness"]');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/readiness$/);
  await expect(page.locator("h1")).toHaveText("Readiness");

  // Readiness -> Name detective; confirm the best-ranked candidate link.
  await tabTo(page, 'a[href="/names"]');
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/names$/);
  await tabTo(page, ".decision button", "Confirm: same person");
  await page.keyboard.press("Enter");
  await expect(live(page)).toContainText("Recorded:");
  await expect(page.locator(".decision-current").first()).toHaveText("Your decision: same person");

  // Name detective -> OCR; store the first scan, then correct one field.
  await tabTo(page, 'a[href="/ocr"]');
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ocr$/);
  const scan = truth.scans[0];
  const name = scan.file.replace("scans/", "");
  const input = `[id="ocr-${name}-reg_no"]`;
  if (!(await page.locator(input).count())) {
    await tabTo(page, "button", "Add to vault");
    await page.keyboard.press("Enter");
    await expect(live(page)).toContainText("Added to your vault");
    await expect(page.locator(input)).toBeVisible();
  }
  await tabTo(page, input);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(scan.fields.reg_no);
  await page.keyboard.press("Tab"); // -> "Confirm as read"
  await page.keyboard.press("Tab"); // -> "Save correction"
  await expect(page.locator(":focus")).toHaveText("Save correction");
  await page.keyboard.press("Enter");
  await expect(live(page)).toContainText("corrected");
  await expect(page.locator(input).locator("xpath=ancestor::td")).toContainText(/Corrected by you|Confirmed by you/);
});
