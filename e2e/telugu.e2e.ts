/**
 * TELUGU SWITCH — press "తెలుగు" and walk the main screens (Home, Am I ready?, Are these the same person?,
 * Check with the issuer, My shares, Alerts). Every page must come back with lang="te", Telugu headings from
 * the locale file, the Telugu menu, and engine reasons rendered in Telugu where a translation exists.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const te = JSON.parse(readFileSync("src/locales/te.json", "utf8")) as Record<string, string>;
const TELUGU = /[ఀ-౿]/;

test("Telugu switch works on the main flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "తెలుగు" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "te");
  await expect(page.locator("h1")).toContainText(te["home.greetingNoName"]);
  await expect(page.locator(".synthetic-strip")).toContainText(te["strip.text"]);
  await expect(page.getByRole("button", { name: te["ui.help"] })).toBeVisible();

  for (const [path, key] of [["/readiness", "ready.title"], ["/names", "names.title"], ["/verify", "verify.title"], ["/shares", "shares.title"], ["/alerts", "alerts.title"]] as const) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "te");
    await expect(page.locator("h1")).toHaveText(te[key]);
    await expect(page.getByRole("navigation", { name: te["nav.label"] })).toContainText(te["nav.side.home"]);
  }
  // Readiness reasons come from the engines in English and are shown in Telugu.
  await page.goto("/readiness");
  const reason = await page.locator(".checklist .meta").first().innerText();
  expect(reason).toMatch(TELUGU);

  // Switching back restores English.
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
