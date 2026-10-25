/**
 * PHASE 10 BEFORE/AFTER SCREENSHOTS — read-only: signs in as each role and photographs the main pages. It only
 * opens pages (GET); it never issues, shares, stops or changes anything, so it is safe to point at the live site.
 *   BASE=https://univault-zeta.vercel.app TAG=before npx tsx scripts/phase10-shots.ts
 *   BASE=http://localhost:3400            TAG=after  npx tsx scripts/phase10-shots.ts
 * Optional: WIDTHS=1440 LANGS=en ONLY=home,share for a quick look.
 * Writes docs/screenshots/phase10/<TAG>/<page>-<width>-<lang>.jpg at 1440, 768 and 390 px wide, English and Telugu.
 */
import { mkdirSync } from "node:fs";
import { chromium, request } from "@playwright/test";
import { generate } from "../src/lib/synthetic-aadhaar";

const BASE = process.env.BASE ?? "http://localhost:3400";
const TAG = process.env.TAG ?? "after";
const OUT = `docs/screenshots/${process.env.PHASE ?? "phase10"}/${TAG}`;
const WIDTHS = (process.env.WIDTHS ?? "1440,768,390").split(",").map(Number);
const LANGS = (process.env.LANGS ?? "en,te").split(",") as ("en" | "te")[];
const ONLY = process.env.ONLY?.split(","); // e.g. ONLY=home,share to photograph a few pages
const PAGES: { role: "sender" | "issuer" | "receiver" | null; path: string; name: string }[] = [
  { role: null, path: "/signin", name: "signin" },
  { role: "sender", path: "/", name: "home" },
  { role: "sender", path: "/documents", name: "documents" },
  { role: "sender", path: "/features", name: "features" },
  { role: "sender", path: "/demo", name: "demo" },
  { role: "sender", path: "/readiness", name: "ready" },
  { role: "sender", path: "/share", name: "share" },
  { role: "sender", path: "/shares", name: "my-shares" },
  { role: "sender", path: "/alerts", name: "alerts" },
  { role: "issuer", path: "/issuer", name: "issuer" },
  { role: "issuer", path: "/issuer/issue", name: "issue" },
  { role: "receiver", path: "/receive", name: "receiver" },
  { role: null, path: "/s/not-a-real-link", name: "recipient-gate" },
];

async function cookiesFor(role: "sender" | "issuer" | "receiver") {
  const api = await request.newContext({ baseURL: BASE });
  const number = generate();
  const { code } = (await (await api.post("/api/auth/code", { data: { number, role } })).json()) as { code: string };
  await api.post("/api/auth/verify", { data: { number, code } });
  await api.post("/api/auth/allow", { data: {} });
  const { cookies } = await api.storageState();
  await api.dispose();
  return cookies;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const jars = { sender: await cookiesFor("sender"), issuer: await cookiesFor("issuer"), receiver: await cookiesFor("receiver") };
  const browser = await chromium.launch({ channel: "msedge" });
  for (const w of WIDTHS) for (const lang of LANGS) {
    for (const p of PAGES.filter((x) => !ONLY || ONLY.includes(x.name))) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 }, reducedMotion: "reduce" });
      await ctx.addCookies([...(p.role ? jars[p.role] : []), { name: "uv_lang", value: lang, url: BASE }, { name: "uv_tour", value: "done", url: BASE }]);
      const page = await ctx.newPage();
      await page.goto(BASE + p.path, { waitUntil: "networkidle" }).catch(() => undefined);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${p.name}-${w}-${lang}.jpg`, type: "jpeg", quality: 78 });
      // Sign-in: also photograph steps 2 (the code) and 3 (consent) in the same panel.
      if (p.name === "signin") {
        await page.locator(".auth-col form button[type=submit]").click().catch(() => undefined);
        await page.locator("[data-otp]").waitFor({ timeout: 10000 }).catch(() => undefined);
        await page.screenshot({ path: `${OUT}/signin-2-${w}-${lang}.jpg`, type: "jpeg", quality: 78 });
        const code = (await page.locator("[data-otp]").innerText().catch(() => "")).trim();
        for (let i = 0; i < code.length; i++) await page.locator(".otp-boxes input").nth(i).fill(code[i]);
        await page.locator(".auth-col form button[type=submit]").click().catch(() => undefined);
        await page.locator(".record-card").waitFor({ timeout: 10000 }).catch(() => undefined);
        await page.screenshot({ path: `${OUT}/signin-3-${w}-${lang}.jpg`, type: "jpeg", quality: 78 });
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log("screenshots written to", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
