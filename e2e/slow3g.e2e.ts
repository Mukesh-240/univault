/**
 * SLOW 3G RUN — open the lightweight recipient-style page on an emulated "Slow 3G" connection
 * (Chrome DevTools preset: about 400 kbit/s down/up, 2 s round-trip latency) and record how long it
 * takes and how many bytes it needs; the full vault page is measured the same way for comparison.
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
  return { path, loadMs, bytes, scripts };
}

test("Slow 3G: recipient-style page is light and loads quickly", async ({ page }) => {
  const preview = await measure(page, "/s/preview?purpose=scholarship");
  await expect(page.locator("h1")).toBeVisible();
  expect(preview.scripts).toBe(0);
  const vault = await measure(page, "/");
  mkdirSync("e2e-results", { recursive: true });
  writeFileSync("e2e-results/slow3g.json", JSON.stringify({ profile: SLOW_3G, preview, vault, recordedAt: new Date().toISOString() }, null, 1));
  expect(preview.loadMs).toBeLessThan(10_000);
});
