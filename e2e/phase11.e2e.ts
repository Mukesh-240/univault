/**
 * PHASE 11 — the redesigned sign-in, home and navigation, through the real screens (in-memory test store):
 *   - the sign-in role list works with the keyboard alone (arrow keys pick a role, Enter continues);
 *   - Home shows at most 3 "needs your attention" rows and never the same title twice, and the four action tiles;
 *   - every "Try it" link on /features and every step on /demo opens a real page (no 404);
 *   - the first-run tour appears once, "Skip" remembers it, and it can be reopened from the avatar menu.
 */
import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("sign-in: the role list works with the keyboard alone", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("radio", { name: /Student or citizen/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /Issuer/ })).toBeChecked();
    await expect(page.locator(".as-list")).toContainText("VIT University");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("radio", { name: /Student or citizen/ })).toBeChecked();
    await expect(page.locator(".as-line")).toContainText("Mahesh Mekhala");
    await page.keyboard.press("Enter"); // submits the role form: Continue
    await expect(page.locator("[data-otp]")).toBeVisible();
    await expect(page.locator(".stepper-title")).toContainText("Step 2 of 3");
  });

  test("first-run tour: shown once, Skip remembers it, reopened from the avatar menu", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const code = (await page.locator("[data-otp]").innerText()).trim();
    for (let i = 0; i < 6; i++) await page.locator(".otp-boxes input").nth(i).fill(code[i]);
    await page.getByRole("button", { name: "Check the code" }).click();
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(page).toHaveURL(/\/$/);
    const tour = page.getByRole("dialog", { name: "Welcome to UNIVAULT" });
    await expect(tour).toBeVisible();
    await expect(tour.locator(".stepper-title")).toContainText("Step 1 of 4");
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour.locator(".stepper-title")).toContainText("Step 2 of 4");
    await tour.getByRole("button", { name: "Skip" }).click();
    await expect(tour).toBeHidden();
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Welcome to UNIVAULT" })).toBeHidden();
    await page.getByRole("button", { name: "Profile" }).click();
    await page.getByRole("button", { name: "Take the tour" }).click();
    await expect(page.getByRole("dialog", { name: "Welcome to UNIVAULT" })).toBeVisible();
  });
});

test("home: four action tiles, at most 3 attention rows, never the same title twice", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tiles .tile")).toHaveCount(4);
  const rows = page.locator(".attn-list li");
  expect(await rows.count()).toBeLessThanOrEqual(3);
  const titles = await rows.locator(".attn-txt strong").allInnerTexts();
  expect(new Set(titles).size).toBe(titles.length);
  expect(await page.locator(".doc-list.compact .doc-row").count()).toBeLessThanOrEqual(6);
  await expect(page.locator(".ready-one")).toHaveCount(1);
});

test("/features: every Try it link opens a real page", async ({ page }) => {
  await page.goto("/features");
  const hrefs = [...new Set(await page.locator("a[data-feature]").evaluateAll((els) => els.map((e) => e.getAttribute("href")!)))];
  expect(hrefs.length).toBeGreaterThan(8);
  for (const h of hrefs) { const r = await page.request.get(h); expect(r.status(), h).toBe(200); }
  await expect(page.locator(".chip", { hasText: "Not built" }).first()).toBeVisible(); // honest statuses are shown
});

test("/demo: six steps, each opens a real page", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.locator(".demo-step")).toHaveCount(6);
  const hrefs = await page.locator("a[data-step]").evaluateAll((els) => els.map((e) => e.getAttribute("data-href")!));
  for (const h of hrefs) { const r = await page.request.get(h, { maxRedirects: 0 }); expect([200, 307], h).toContain(r.status()); }
});
