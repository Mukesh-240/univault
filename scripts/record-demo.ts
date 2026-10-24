/**
 * RECORD DEMO — five short screen recordings (.webm, 1280x720) of the real app, saved in docs/demo/:
 *   1 signin-hero          the hero, the role cards, a demo profile, the code, the consent card
 *   2 verify-with-issuer   a freshly issued document is checked with its issuer: scan line, then the seal stamps
 *   3 share-wizard         the four-step share wizard, step by step, to "Share now"
 *   4 issuing-a-document   the issuer wizard: who, what, details, review, sign (the seal stamps the paper)
 *   5 receiving            the receiver opens what was shared: banner, items, watermark
 *   Run with the app up:  BASE=http://localhost:3400 npx tsx scripts/record-demo.ts
 * It drives the same screens a person would; nothing is staged. Motion is ON (this is what the recordings show).
 */
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { chromium, request, type Browser, type Page } from "@playwright/test";
import { generate } from "../src/lib/synthetic-aadhaar";

const BASE = process.env.BASE ?? "http://localhost:3400";
const OUT = "docs/demo";
const TMP = "e2e-results/video-tmp";

async function cookiesFor(role: "issuer" | "sender" | "receiver", ref?: string) {
  const api = await request.newContext({ baseURL: BASE });
  const number = generate();
  const { code } = (await (await api.post("/api/auth/code", { data: { number, role, ref } })).json()) as { code: string };
  await api.post("/api/auth/verify", { data: { number, code } });
  await api.post("/api/auth/allow", { data: {} });
  const c = (await api.storageState()).cookies;
  await api.dispose();
  return c;
}

/** Record one clip: open a page (optionally signed in), run the steps, save the video as docs/demo/<name>.webm. */
async function clip(browser: Browser, name: string, cookies: Awaited<ReturnType<typeof cookiesFor>> | null, steps: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, baseURL: BASE, recordVideo: { dir: TMP, size: { width: 1280, height: 720 } } });
  if (cookies) await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await steps(page);
  await page.waitForTimeout(900);
  const video = page.video();
  await ctx.close();
  if (video) renameSync(await video.path(), `${OUT}/${name}.webm`);
  console.log("recorded", name);
}
const beat = (p: Page, ms = 900) => p.waitForTimeout(ms);

async function issueFields(p: Page) {
  const answers: Record<string, string> = { reg_no: "R-5005", degree: "Degree", branch: "Branch", cgpa: "8.6", year_of_passing: "2024", year_of_leaving: "2020" };
  for (const [k, v] of Object.entries(answers)) { const el = p.locator(`#iss-${k}`); if (await el.count()) await el.fill(v); }
}

async function main() {
  mkdirSync(OUT, { recursive: true }); rmSync(TMP, { recursive: true, force: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const issuer = await cookiesFor("issuer", process.env.ISSUER ?? "Synthetic State University");
  const sender = await cookiesFor("sender"), receiver = await cookiesFor("receiver");

  await clip(browser, "signin-hero", null, async (p) => {
    await p.goto("/signin"); await beat(p, 3800);
    await p.locator(".role-card.role-sender button").click(); await beat(p);
    await p.locator(".profile-card").first().click(); await p.locator("[data-otp]").waitFor(); await beat(p);
    const code = (await p.locator("[data-otp]").innerText()).trim();
    for (let i = 0; i < 6; i++) { await p.locator(".otp-boxes input").nth(i).fill(code[i]); await p.waitForTimeout(160); }
    await p.locator("main button[type=submit]").click(); await p.locator(".record-card").waitFor(); await beat(p, 1400);
  });

  let documentId = "";
  await clip(browser, "issuing-a-document", issuer, async (p) => {
    await p.goto("/issuer"); await beat(p, 1600);
    await p.goto("/issuer/issue"); await beat(p);
    await p.locator(".profile-card").first().click(); await beat(p);
    await p.locator(".radio-card").first().click(); await beat(p, 500);
    await p.getByRole("button", { name: "Next", exact: true }).click(); await beat(p, 600);
    await issueFields(p); await beat(p, 1200);
    await p.locator("form.card button[type=submit]").click(); await beat(p, 1400);
    const issued = p.waitForResponse((r) => r.url().includes("/api/issuer-portal/issue") && r.request().method() === "POST");
    await p.locator(".issue-split .card button").click();
    documentId = ((await (await issued).json()) as { documentId: string }).documentId;
    await beat(p, 2600);
  });

  await clip(browser, "verify-with-issuer", sender, async (p) => {
    await p.goto(`/doc/${documentId}`); await beat(p, 1500);
    await p.getByRole("button", { name: "Check with the issuer" }).first().click(); await beat(p, 3600);
  });

  await clip(browser, "share-wizard", sender, async (p) => {
    await p.goto("/share"); await beat(p, 1400);
    for (let step = 2; step <= 4; step++) { await p.locator("main button:not(.secondary):not(.text)").last().click(); await beat(p, step === 4 ? 3200 : 1300); }
    await p.locator("main button:not(.secondary):not(.text)").last().click(); await beat(p, 2800);
  });

  await clip(browser, "receiving", receiver, async (p) => {
    await p.goto("/receive"); await beat(p, 1800);
    const open = p.locator("a[href^='/receive/']").first();
    if (await open.count()) { await open.click(); await beat(p, 3600); }
  });
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
