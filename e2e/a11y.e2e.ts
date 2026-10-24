/**
 * ACCESSIBILITY SCAN — runs axe-core (the standard automated accessibility checker) on every page, in
 * English and in Telugu, in three looks: normal, A+ text size (150%, 30px) and High contrast, against
 * WCAG 2.1 A/AA rules. The acceptance bar is ZERO violations of any kind. All counts are written to
 * e2e-results/axe.json. A second group checks that no page scrolls sideways on a 360px phone, at normal
 * and at A+ size. (axe covers only part of WCAG; the keyboard-only and sign-in journeys cover the rest.)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// "/doc" stands for one real document page (its id is looked up on Home).
const PAGES = ["/signin", "/", "/doc", "/readiness", "/share", "/shares", "/alerts", "/more", "/add", "/add/file", "/ocr", "/names", "/verify", "/ledger",
  "/leak-trace", "/assistant", "/faults", "/threat-model", "/policy", "/s/preview?purpose=scholarship", "/s/not-a-real-link"];
const LANGS = ["en", "te"] as const;
const MODES = [
  { name: "normal", cookies: [] as { name: string; value: string }[] },
  { name: "A+", cookies: [{ name: "uv_size", value: "150" }] },
  { name: "high-contrast", cookies: [{ name: "uv_contrast", value: "high" }] },
];
const results: { page: string; lang: string; mode: string; critical: number; serious: number; moderate: number; minor: number; rules: string[] }[] = [];

/** The first document's page address, read from Home. */
async function firstDocPath(page: Page): Promise<string> {
  await page.goto("/");
  const href = await page.locator('a[href^="/doc/"]').first().getAttribute("href");
  if (!href) throw new Error("no document card on Home");
  return href;
}

for (const lang of LANGS)
  for (const mode of MODES)
    for (const path of PAGES)
      test(`axe: ${path} (${lang}, ${mode.name})`, async ({ page, browser, baseURL }) => {
        const cookies = [{ name: "uv_lang", value: lang, url: baseURL! }, ...mode.cookies.map((c) => ({ ...c, url: baseURL! }))];
        const anon = path === "/signin"; // the sign-in page is only for signed-out visitors
        const ctx = anon ? await browser.newContext({ baseURL, reducedMotion: "reduce", storageState: { cookies: [], origins: [] } }) : page.context();
        await ctx.addCookies(cookies);
        const p = anon ? await ctx.newPage() : page;
        await p.goto(path === "/doc" ? await firstDocPath(p) : path);
        await expect(p.locator("h1").first()).toBeVisible();
        const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const n = (impact: string) => r.violations.filter((v) => v.impact === impact).length;
        results.push({ page: path, lang, mode: mode.name, critical: n("critical"), serious: n("serious"), moderate: n("moderate"), minor: n("minor"),
          rules: r.violations.map((v) => `${v.impact}:${v.id}(${v.nodes.length})`) });
        if (anon) await ctx.close();
        expect(r.violations.map((v) => `${v.impact} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      });

for (const lang of LANGS)
  for (const size of ["100", "150"])
    test(`360px: no sideways scrolling on any page (${lang}, text ${size}%)`, async ({ browser, baseURL }) => {
      test.setTimeout(240_000);
      const signedIn = await browser.newContext({ baseURL, viewport: { width: 360, height: 740 }, reducedMotion: "reduce", storageState: "e2e-results/auth.json" });
      const signedOut = await browser.newContext({ baseURL, viewport: { width: 360, height: 740 }, reducedMotion: "reduce", storageState: { cookies: [], origins: [] } });
      const cookies = [{ name: "uv_lang", value: lang, url: baseURL! }, { name: "uv_size", value: size, url: baseURL! }];
      await signedIn.addCookies(cookies); await signedOut.addCookies(cookies);
      const wide: string[] = [];
      const page = await signedIn.newPage();
      for (const path of PAGES) {
        const p = path === "/signin" ? await signedOut.newPage() : page;
        await p.goto(path === "/doc" ? await firstDocPath(p) : path);
        await p.waitForLoadState("networkidle"); const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) wide.push(`${path} (+${over}px) ${await p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => (e.getBoundingClientRect().right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1)).slice(0, 9).map((e) => e.tagName + "." + e.className + ":" + Math.round(e.getBoundingClientRect().left) + "-" + Math.round(e.getBoundingClientRect().right) + ":" + getComputedStyle(e.closest(".filter-form") ?? e).gridTemplateColumns + ":" + innerWidth + ":" + document.documentElement.clientWidth).join(" "))}`);
        if (p !== page) await p.close();
      }
      await signedIn.close(); await signedOut.close();
      expect(wide).toEqual([]);
    });

test.afterAll(() => {
  mkdirSync("e2e-results", { recursive: true });
  writeFileSync("e2e-results/axe.json", JSON.stringify(results, null, 1));
});
