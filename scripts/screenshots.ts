/**
 * SCREENSHOTS for the README — drives the real app in Microsoft Edge and saves JPEGs to docs/screenshots/.
 *   Run (app must be running, e.g. `npm run build && UNIVAULT_OFFLINE_DEMO=1 npm start -- -p 3400`):
 *     npm run screenshots              (or BASE=http://host:port npm run screenshots)
 * For each of 1440px and 390px wide, English and Telugu, normal text (16px) and A++ (20px), it tells the whole story through
 * the real screens: the sender signs in (the 4 sign-in screens), the issuer issues a document (the 5 wizard screens),
 * a receiver asks for something, the sender shares from the request (4 wizard screens), the receiver opens it, and
 * the recipient gate. Nothing is staged or faked; the same journey the browser tests walk.
 */
import { mkdirSync } from "node:fs";
import { chromium, request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { generate } from "../src/lib/synthetic-aadhaar";

const BASE = process.env.BASE ?? "http://localhost:3400";
const OUT = "docs/screenshots";
const VIEWS = [{ tag: "1440", w: 1440, h: 900 }, { tag: "390", w: 390, h: 844 }];
const ISSUER = process.env.ISSUER ?? "VIT University";

/** Sign in as one role through the real API (default profile unless `ref` is given) and return the browser cookies. */
async function cookiesFor(role: "issuer" | "receiver", ref?: string) {
  const api = await request.newContext({ baseURL: BASE });
  const number = generate();
  const { code } = (await (await api.post("/api/auth/code", { data: { number, role, ref } })).json()) as { code: string };
  await api.post("/api/auth/verify", { data: { number, code } });
  await api.post("/api/auth/allow", { data: {} });
  const state = await api.storageState();
  await api.dispose();
  return state.cookies;
}

async function combo(browser: Browser, vp: (typeof VIEWS)[number], lang: "en" | "te", size: "16" | "20") {
  const mk = async (cookies: Awaited<ReturnType<typeof cookiesFor>> = []): Promise<[BrowserContext, Page]> => {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, baseURL: BASE, reducedMotion: "reduce" });
    await ctx.addCookies([...cookies, { name: "uv_lang", value: lang, url: BASE }, { name: "uv_size", value: size, url: BASE }]);
    return [ctx, await ctx.newPage()];
  };
  const tag = `${vp.tag}-${lang}-${size === "20" ? "A++" : "normal"}`;
  const shot = (p: Page) => (n: string) => p.screenshot({ path: `${OUT}/${n}-${tag}.jpg`, type: "jpeg", quality: 82 }).then(() => undefined);

  // 1. The sender signs in through the real screens (4 shots) and keeps that session.
  const [sctx, s] = await mk();
  const sh = shot(s);
  await s.goto("/signin");
  await sh("signin-1-role");
  await s.locator(".role-card.role-sender button").click();
  await sh("signin-2-profile");
  await s.locator(".profile-card").first().click();
  await s.locator("[data-otp]").waitFor();
  const code = (await s.locator("[data-otp]").innerText()).trim();
  for (let i = 0; i < 6; i++) await s.locator(".otp-boxes input").nth(i).fill(code[i]);
  await sh("signin-3-code");
  await s.locator("main button[type=submit]").click();
  await s.locator(".record-card").waitFor();
  await sh("signin-4-consent");
  await s.locator("main button[type=button]:not(.text)").click();
  await s.waitForURL(/\/$/);
  await s.waitForTimeout(1500);
  await sh("home");
  await s.locator("main ul.cards a").first().click();
  await s.waitForTimeout(800); await sh("document");
  await s.goto("/readiness"); await sh("am-i-ready");

  // 2. The issuer issues a document (wizard screens).
  const [ictx, i] = await mk(await cookiesFor("issuer", ISSUER));
  const ih = shot(i);
  await i.goto("/issuer"); await i.waitForTimeout(1200); await ih("issuer-dashboard");
  await i.goto("/issuer/issue"); await i.waitForTimeout(500); await ih("issue-1-who");
  await i.locator(".profile-card").first().click();
  await ih("issue-2-type");
  await i.locator(".radio-card").first().click();
  await i.getByRole("button", { name: /^(Next|తరువాత)$/ }).click();
  const answers: Record<string, string> = { reg_no: "R-4004", degree: "Degree", branch: "Branch", cgpa: "8.4", year_of_passing: "2024", annual_income: "120000", issued_on: "2026-05-01", valid_until: "2027-05-01", dob: "2001-03-04", roll_no: "R-77", year: "2017", year_of_leaving: "2020" };
  for (const [k, v] of Object.entries(answers)) { const el = i.locator(`#iss-${k}`); if (await el.count()) await el.fill(v); }
  await ih("issue-3-details");
  await i.locator("form.card button[type=submit]").click(); await i.waitForTimeout(500); await ih("issue-4-review");
  await i.locator(".issue-split .card button").click(); await i.locator(".paper.signed").waitFor(); await i.waitForTimeout(900); await ih("issue-5-done");
  await i.goto("/issuer/issued"); await ih("issued-list");

  // 3. A receiver asks for degree-certificate items; the sender shares from that request.
  const [rctx, r] = await mk(await cookiesFor("receiver"));
  const rh = shot(r);
  await r.goto("/receive"); await rh("receiver-inbox");
  await r.goto("/receive/ask"); await r.locator(".profile-card").first().click();
  const box = r.locator("fieldset input[type=checkbox]").first();
  if (await box.count()) await box.check();
  await rh("receiver-ask");
  await r.getByRole("button", { name: /^(Send request|అభ్యర్థన పంపండి)$/ }).click();
  await r.waitForTimeout(800);
  await s.goto("/alerts"); await sh("alerts");
  const link = s.getByRole("link", { name: /^(Share these|ఇవి షేర్ చేయండి)$/ }).first();
  if (await link.count()) await link.click(); else await s.goto("/share");
  await s.waitForTimeout(500); await sh("share-1-who");
  for (let step = 2; step <= 4; step++) {
    await s.locator("main button:not(.secondary):not(.text)").last().click();
    await s.waitForTimeout(step === 4 ? 2500 : 500);
    await sh(`share-${step}-${["", "", "what", "how-long", "review"][step]}`);
  }
  await s.locator("main button:not(.secondary):not(.text)").last().click().catch(() => undefined);
  await s.waitForTimeout(1500);

  // 4. The receiver opens it; the sender's shares; the recipient gate.
  await r.goto("/receive"); await rh("receiver-inbox-shared");
  const open = r.locator("a[href^='/receive/']").first();
  if (await open.count()) { await open.click(); await r.waitForTimeout(800); await rh("receiver-view"); }
  await r.goto("/receive/requests"); await rh("receiver-requests");
  await s.goto("/shares"); await sh("my-shares");
  const [gctx, g] = await mk();
  await g.goto("/s/not-a-real-link"); await shot(g)("recipient-gate");
  await Promise.all([sctx, ictx, rctx, gctx].map((c) => c.close()));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  for (const vp of VIEWS) for (const lang of ["en", "te"] as const) for (const size of ["16", "20"] as const) {
    await combo(browser, vp, lang, size);
    console.log("done", vp.tag, lang, size);
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
