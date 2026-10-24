/**
 * SCREENSHOTS for the README — drives the real app in Microsoft Edge and saves PNGs to docs/screenshots/.
 *   Run (app must be running, e.g. `npm run build && UNIVAULT_OFFLINE_DEMO=1 npm start -- -p 3400`):
 *     npm run screenshots              (or BASE=http://host:port npm run screenshots)
 * For each of 1440px and 390px wide, English and Telugu, normal text and A+ (150%), it signs in with a
 * generated demo number through the real three steps and photographs the main screens, the share wizard
 * (4 steps), and the recipient gate. Nothing is staged or faked.
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { generate } from "../src/lib/synthetic-aadhaar";

const BASE = process.env.BASE ?? "http://localhost:3400";
const OUT = "docs/screenshots";
const WIDTHS = [{ tag: "1440", width: 1440, height: 900 }, { tag: "390", width: 390, height: 844 }];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  for (const vp of WIDTHS) for (const lang of ["en", "te"] as const) for (const size of ["100", "150"] as const) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, baseURL: BASE, reducedMotion: "reduce" });
    await ctx.addCookies([{ name: "uv_lang", value: lang, url: BASE }, { name: "uv_size", value: size, url: BASE }]);
    const page = await ctx.newPage();
    const shot = (n: string) => page.screenshot({ path: `${OUT}/${n}-${vp.tag}-${lang}-${size === "150" ? "A+" : "normal"}.png` });

    // Sign-in, three steps.
    await page.goto("/signin");
    await page.locator("#aad").fill(generate());
    await shot("signin-1-number");
    await page.locator("main button[type=submit]").click();
    await page.locator("[data-otp]").waitFor();
    await shot("signin-2-code");
    const code = (await page.locator("[data-otp]").innerText()).trim();
    const boxes = page.locator(".otp-boxes input");
    for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i]);
    await page.locator("main button[type=submit]").click();
    await page.locator(".record-card").waitFor();
    await shot("signin-3-consent");
    await page.locator("main button[type=button]:not(.text)").click();
    await page.waitForURL(/\/$/);

    await page.waitForLoadState("networkidle"); await shot("home");
    await page.locator("main ul.cards a").first().click();
    await page.waitForLoadState("networkidle"); await shot("document");
    await page.goto("/readiness"); await shot("am-i-ready");
    await wizard(page, shot);
    await page.goto("/shares"); await shot("my-shares");
    await page.goto("/alerts"); await shot("alerts");
    await page.goto("/s/not-a-real-link"); await shot("recipient-gate");
    await ctx.close();
  }
  await browser.close();
}

/** The 4-step share wizard: step 1 is shown, then each press of the main button moves on. */
async function wizard(page: Page, shot: (n: string) => Promise<unknown>) {
  await page.goto("/share");
  await shot("share-1-who");
  const names = ["", "", "what", "how-long", "review"];
  for (let step = 2; step <= 4; step++) {
    await page.locator("main button:not(.secondary):not(.text)").last().click();
    await page.waitForTimeout(step === 4 ? 2500 : 400);
    await shot(`share-${step}-${names[step]}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
