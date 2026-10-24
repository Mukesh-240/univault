/**
 * SLOW 3G RUN — open the lightweight recipient-style page on an emulated "Slow 3G" connection
 * (Chrome DevTools preset: about 400 kbit/s down/up, 2 s round-trip latency) and record how long it
 * takes and how many bytes it needs; the full vault page is measured the same way (English and Telugu).
 * loadMs = until the browser's "load" event (all scripts in); fcpMs = first contentful paint (the
 * server-rendered vault is readable from then on, before the scripts arrive).
 * A trace of the run (filmstrip + network timeline) is saved under e2e-results/artifacts; numbers go to e2e-results/slow3g.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const SLOW_3G = { offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000 };

test.use({ trace: "on" }); // a Playwright trace (screenshots + network timeline) is the recording; open with: npx playwright show-trace <file>

async function measure(page: Page, path: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", SLOW_3G);
  let bytes = 0;
  cdp.on("Network.loadingFinished", (e: { encodedDataLength: number }) => { bytes += e.encodedDataLength; });
  const start = Date.now();
  await page.goto(path, { waitUntil: "load", timeout: 90_000 });
  const loadMs = Date.now() - start;
  const scripts = await page.locator("script[src]").count();
  const fcpMs = await page.evaluate(() => Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1));
  await cdp.detach();
  return { path, loadMs, fcpMs, bytes, scripts };
}

test("Slow 3G: recipient-style page is light and loads quickly", async ({ page }) => {
  const preview = await measure(page, "/s/preview?purpose=scholarship");
  await expect(page.locator("h1")).toBeVisible();
  expect(preview.scripts).toBe(0);
  const vault = await measure(page, "/");
  await page.context().addCookies([{ name: "uv_lang", value: "te", url: page.url() }]);
  const vaultTe = await measure(page, "/");
  mkdirSync("e2e-results", { recursive: true });
  writeFileSync("e2e-results/slow3g.json", JSON.stringify({ profile: SLOW_3G, preview, vault, vaultTe, recordedAt: new Date().toISOString() }, null, 1));
  expect(preview.loadMs).toBeLessThan(10_000);
  // Regression guard: Phase 6 took the English vault from 405 KB to about 175 KB (no Telugu font, no fetch loop).
  // TARGET (Phase 7 brief): 169 KB and 7.2 s. NOT MET since the Phase 8 role shell (about 200 KB, 8.7 s in the last run; a re-run of
  // Phase 7 on the same method gave 201 KB, 7.3 s). This ceiling only guards against further growth; see HANDOFF.md.
  expect(vault.bytes).toBeLessThan(230_000);
});
