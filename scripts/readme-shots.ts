/**
 * README SCREENSHOTS — walks through the real demo like a person would and photographs each screen for README.md:
 * sign-in, Home, documents, checks, readiness, a share (review, receipt), the receiver's link (gate, watermarked
 * view), leak trace, an eligibility request (asked, answered), the ledger, the issuer and the receiver areas.
 *
 * It CREATES shares and requests, so it only runs against a local in-memory store, never the live site:
 *   npm run build && UNIVAULT_OFFLINE_DEMO=1 UNIVAULT_FORCE_OFFLINE=1 npx next start -p 3400
 *   npx tsx scripts/readme-shots.ts
 * Writes docs/readme/<nn>-<name>.jpg (1440 px wide, English), plus a few phone (390 px) and Telugu shots.
 */
import { mkdirSync } from "node:fs";
import { chromium, request, type Browser, type BrowserContext, type Cookie, type Page } from "@playwright/test";
import { generate } from "../src/lib/synthetic-aadhaar";

const BASE = process.env.BASE ?? "http://localhost:3400";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("readme-shots writes data: point BASE at a local in-memory store only.");
const OUT = "docs/readme";
type Role = "sender" | "issuer" | "receiver";

/** Sign in through the same API the sign-in page uses, and keep the cookies. */
async function cookiesFor(role: Role): Promise<Cookie[]> {
  const api = await request.newContext({ baseURL: BASE });
  const number = generate();
  const { code } = (await (await api.post("/api/auth/code", { data: { number, role } })).json()) as { code: string };
  await api.post("/api/auth/verify", { data: { number, code } });
  await api.post("/api/auth/allow", { data: {} });
  const { cookies } = await api.storageState();
  await api.dispose();
  return cookies;
}

async function open(browser: Browser, cookies: Cookie[], width = 1440, lang = "en"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width, height: width > 800 ? 900 : 844 }, reducedMotion: "reduce", baseURL: BASE });
  await ctx.addCookies([...cookies, { name: "uv_lang", value: lang, url: BASE }, { name: "uv_tour", value: "done", url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}

/** Photograph the screen; a step that fails is reported and skipped, so one broken screen never stops the rest. */
async function shot(page: Page, name: string, go?: string) {
  try {
    if (go) await page.goto(go, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 80 });
    console.info("ok  ", name);
  } catch (e) { console.warn("skip", name, (e as Error).message.split("\n")[0]); }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const jar = { sender: await cookiesFor("sender"), issuer: await cookiesFor("issuer"), receiver: await cookiesFor("receiver") };
  const browser = await chromium.launch({ channel: "msedge" });

  // 1. Sign-in (signed out).
  const out = await open(browser, []);
  await shot(out.page, "01-signin", "/signin");

  // 2. The issuer's area; the student's screens.
  const iss = await open(browser, jar.issuer);
  await shot(iss.page, "02-issuer-home", "/issuer");
  await shot(iss.page, "03-issuer-issue", "/issuer/issue");
  const s = await open(browser, jar.sender);
  await shot(s.page, "04-home", "/");
  await shot(s.page, "05-documents", "/documents");
  const firstDoc = await s.page.locator("a[href^='/doc/']").first().getAttribute("href").catch(() => null);
  if (firstDoc) await shot(s.page, "06-document", firstDoc);
  await shot(s.page, "07-verify", "/verify");
  await shot(s.page, "08-readiness", "/readiness");
  await shot(s.page, "09-names", "/names");
  await shot(s.page, "10-ocr", "/ocr");
  await shot(s.page, "11-add", "/add");

  // 3. A share: who, what, how long, then the exact view the receiver will get, then the receipt.
  let link = "", recipientId = "";
  try {
    await s.page.goto("/share");
    await s.page.locator(".radio-card").first().click();
    await s.page.getByRole("button", { name: "Next" }).click();
    await s.page.getByRole("button", { name: "Next" }).click();
    await s.page.getByRole("button", { name: "Review what they will see" }).click();
    await s.page.getByRole("heading", { name: "Review and send" }).waitFor({ timeout: 30_000 });
    await shot(s.page, "12-share-review");
    await s.page.getByRole("button", { name: /^Share with / }).click();
    await s.page.getByRole("heading", { name: "Your share is ready" }).waitFor({ timeout: 30_000 });
    await shot(s.page, "13-share-receipt");
    link = await s.page.getByLabel("Their personal link").inputValue();
    recipientId = (await s.page.locator(".receipt dd code").first().innerText()).trim();
  } catch (e) { console.warn("skip share", (e as Error).message.split("\n")[0]); }

  // 4. The receiver opens the link: ID + simulated code, then the minimal watermarked view.
  let watermark = "";
  if (link) {
    const r = await open(browser, []);
    await r.page.goto(link);
    await r.page.getByLabel("Recipient ID").fill(recipientId);
    await r.page.getByRole("button", { name: "Send me a one-time code" }).click();
    await r.page.locator("[data-otp]").waitFor();
    await shot(r.page, "14-recipient-gate");
    await r.page.getByLabel("One-time code").fill((await r.page.locator("[data-otp]").innerText()).trim());
    await r.page.getByRole("button", { name: "Open" }).click();
    await r.page.getByRole("heading", { name: "Shared with you" }).waitFor();
    await shot(r.page, "15-recipient-view");
    watermark = (await r.page.locator("[data-watermark]").innerText()).trim();
    await r.ctx.close();
  }

  // 5. Leak trace from the watermark text, and who has access.
  if (watermark) {
    await s.page.goto("/leak-trace");
    await s.page.getByLabel("Watermark text").fill(watermark);
    await s.page.getByRole("button", { name: "Trace" }).click();
    await s.page.locator("#live-region").getByText(/Traced to/).waitFor().catch(() => undefined);
    await shot(s.page, "16-leak-trace");
  }
  await shot(s.page, "17-shares", "/shares");

  // 6. Google asks an eligibility question; the student answers one criterion.
  const rc = await open(browser, jar.receiver);
  await shot(rc.page, "18-receiver-home", "/receive");
  try {
    await rc.page.goto("/receive/eligibility");
    await rc.page.locator(".profile-card").first().click();
    await shot(rc.page, "19-eligibility-ask");
    await rc.page.getByRole("button", { name: "Send eligibility request" }).click();
    await rc.page.getByText(/Request sent\./).waitFor();
    await s.page.goto("/alerts", { waitUntil: "networkidle" });
    await shot(s.page, "20-alerts-request");
    const card = s.page.locator("li.card").filter({ hasText: "criteria for" }).first();
    await card.locator("input[type=checkbox]").first().check();
    await card.getByRole("button", { name: "Run the check and send the result" }).click();
    await s.page.locator("section.trail").first().waitFor();
    await s.page.locator("section.trail").first().scrollIntoViewIfNeeded();
    await shot(s.page, "21-eligibility-answered");
  } catch (e) { console.warn("skip eligibility", (e as Error).message.split("\n")[0]); }

  // 7. Proof and trust pages.
  await shot(s.page, "22-ledger", "/ledger");
  await shot(s.page, "23-faults", "/faults");
  await shot(s.page, "24-features", "/features");
  await shot(s.page, "25-demo", "/demo");
  await shot(s.page, "26-threat-model", "/threat-model");

  // 8. Phones, and Telugu.
  const phone = await open(browser, jar.sender, 390);
  await shot(phone.page, "27-phone-home", "/");
  const te = await open(browser, jar.sender, 390, "te");
  await shot(te.page, "28-phone-home-te", "/");
  const outPhone = await open(browser, [], 390);
  await shot(outPhone.page, "29-phone-signin", "/signin");

  await browser.close();
  console.info("screenshots written to", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
