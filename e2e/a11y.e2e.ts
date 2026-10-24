/**
 * ACCESSIBILITY SCAN — runs axe-core (the standard automated accessibility checker) on each page,
 * in English and in Telugu, against WCAG 2.1 A/AA rules. The acceptance bar: zero "critical" and
 * zero "serious" violations. All counts are written to e2e-results/axe.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/readiness", "/names", "/ocr", "/verify", "/assistant", "/faults", "/s/preview?purpose=scholarship"];
const LANGS = ["en", "te"] as const;
const results: { page: string; lang: string; critical: number; serious: number; moderate: number; minor: number; rules: string[] }[] = [];

for (const lang of LANGS)
  for (const path of PAGES)
    test(`axe: ${path} (${lang})`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "uv_lang", value: lang, url: baseURL! }]);
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const n = (impact: string) => r.violations.filter((v) => v.impact === impact).length;
      results.push({ page: path, lang, critical: n("critical"), serious: n("serious"), moderate: n("moderate"), minor: n("minor"),
        rules: r.violations.map((v) => `${v.impact}:${v.id}(${v.nodes.length})`) });
      expect(r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });

test.afterAll(() => {
  mkdirSync("e2e-results", { recursive: true });
  writeFileSync("e2e-results/axe.json", JSON.stringify(results, null, 1));
});
