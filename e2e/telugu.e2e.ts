/**
 * TELUGU SWITCH — press "తెలుగు" and walk the main flow (vault, readiness, name detective,
 * verification). Every page must come back with lang="te", Telugu headings from the locale file,
 * and engine reasons rendered in Telugu where a translation exists.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const te = JSON.parse(readFileSync("src/locales/te.json", "utf8")) as Record<string, string>;
const TELUGU = /[ఀ-౿]/;

test("Telugu switch works on the main flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "తెలుగు" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "te");
  await expect(page.locator("h1")).toHaveText(te["vault.title"]);
  await expect(page.locator(".banner")).toContainText(te["banner.synthetic"]);

  for (const [path, key] of [["/readiness", "readiness.title"], ["/names", "names.title"], ["/verify", "verify.title"]] as const) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "te");
    await expect(page.locator("h1")).toHaveText(te[key]);
    await expect(page.getByRole("navigation")).toContainText(te["nav.vault"]);
  }
  // Readiness reasons come from the engines in English and are shown in Telugu.
  await page.goto("/readiness");
  const reason = await page.locator(".explain-reason").first().innerText();
  expect(reason).toMatch(TELUGU);

  // Switching back restores English.
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
