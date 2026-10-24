/**
 * PHASE 10 BEFORE/AFTER SCREENSHOTS — read-only: signs in as each role and photographs the main pages. It only
 * opens pages (GET); it never issues, shares, stops or changes anything, so it is safe to point at the live site.
 *   BASE=https://univault-zeta.vercel.app TAG=before npx tsx scripts/phase10-shots.ts
 *   BASE=http://localhost:3400            TAG=after  npx tsx scripts/phase10-shots.ts
 * Writes docs/screenshots/phase10/<TAG>/<page>-<width>-<lang>.jpg at 1440, 768 and 390 px wide, English and Telugu.
 */
import { mkdirSync } from "node:fs";
import { chromium, request } from "@playwright/test";
import { generate } from "../src/lib/synthetic-aadhaar";

const BASE = process.env.BASE ?? "http://localhost:3400";
const TAG = process.env.TAG ?? "after";
const OUT = `docs/screenshots/phase10/${TAG}`;
const WIDTHS = [1440, 768, 390];
const PAGES: { role: "sender" | "issuer" | "receiver" | null; path: string; name: string }[] = [
  { role: null, path: "/signin", name: "signin" },
  { role: "sender", path: "/", name: "home" },
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
  for (const w of WIDTHS) for (const lang of ["en", "te"] as const) {
    for (const p of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 }, reducedMotion: "reduce" });
      await ctx.addCookies([...(p.role ? jars[p.role] : []), { name: "uv_lang", value: lang, url: BASE }]);
      const page = await ctx.newPage();
      await page.goto(BASE + p.path, { waitUntil: "networkidle" }).catch(() => undefined);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${p.name}-${w}-${lang}.jpg`, type: "jpeg", quality: 78 });
      await ctx.close();
    }
  }
  await browser.close();
  console.log("screenshots written to", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
