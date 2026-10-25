/**
 * PHASE 10 — every main flow shows WHERE you are (the stepper) and WHAT the system just did (the step trail),
 * through the real screens and the real server (the trails are built from real results and ledger lines):
 *   share, open a shared link (plain-HTML recipient pages), issue, verify, stop sharing, eligibility, sign-in,
 *   same person, leak trace; plus a keyboard-only walk of the issue wizard.
 * Runs against the local server and the project database, like the other browser tests.
 */
import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE, ISSUER_AUTH, RECEIVER_AUTH } from "./global-setup";

const trail = (page: Page) => page.locator("section.trail").last();
const stepsIn = async (page: Page) => Number(await trail(page).getAttribute("data-trail-steps"));

test("share: the stepper on every step, and the receipt's trail names real ledger lines", async ({ page }) => {
  await page.goto("/share");
  for (let step = 1; step <= 3; step++) {
    await expect(page.locator(".stepper [aria-current=step]")).toHaveCount(1);
    await expect(page.locator(".stepper-title")).toContainText(`Step ${step} of 4`);
    await expect(page.locator(".stepper-what")).toContainText("What happens here");
    const next = step < 3 ? page.getByRole("button", { name: "Next", exact: true }) : page.getByRole("button", { name: "Review what they will see" });
    await next.click();
  }
  await expect(page.locator(".stepper-title")).toContainText("Step 4 of 4");
  const [confirmed] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/share/confirm")), page.getByRole("button", { name: /^Share with / }).click()]);
  const receipt = (await confirmed.json()).receipt as { ledger: { seq: number }[] };
  expect(receipt.ledger.length).toBeGreaterThan(0);
  await expect(trail(page)).toBeVisible();
  expect(await stepsIn(page)).toBe(5);
  await expect(trail(page)).toContainText(`ledger line ${Math.max(...receipt.ledger.map((l) => l.seq))}`);
  await expect(page.locator("details.under-hood summary")).toHaveText("Under the hood (technical names)");
});

test("open a shared link: the gate, a wrong code and the view each show their stepper and trail", async ({ browser, baseURL }) => {
  const sender = await browser.newContext({ baseURL, storageState: AUTH_FILE });
  const sp = await sender.newPage();
  await sp.goto("/share");
  const code = (await sp.locator("input[name=recipient]").first().getAttribute("id"))!.replace("rcp-", "");
  const d = { recipient_code: code, purpose: "job", fields: ["degree_certificate.degree"], expires_at: new Date(Date.now() + 86_400_000).toISOString(), policy: { mode: "view_only" } };
  const pv = await (await sender.request.post("/api/share/preview", { data: d })).json();
  const made = await (await sender.request.post("/api/share/confirm", { data: { draft: d, preview_token: pv.previewToken, idempotency_key: crypto.randomUUID() } })).json();
  const link = new URL(made.receipt.link).pathname;

  const visitor = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const p = await visitor.newPage();
  await p.goto(link);
  await expect(p.locator("ol.st [aria-current=step]")).toContainText("Your recipient ID");
  await expect(p.locator("ol.tr")).toHaveAttribute("data-trail-steps", "4");
  await p.locator("#rid").fill(code);
  await p.getByRole("button", { name: "Send me a one-time code" }).click();
  const otp = (await p.locator("[data-otp]").innerText()).trim();
  await expect(p.locator("ol.tr")).toContainText("SIMULATED");
  await p.locator("#code").fill(otp === "000000" ? "111111" : "000000");
  await p.getByRole("button", { name: "Open" }).click();
  await expect(p.locator("ol.tr")).toContainText("we do not say which");
  await expect(p.locator("ol.tr")).toContainText("Attempts left");
  // A fresh code, the right one this time: everything done.
  await p.locator("#rid").fill(code);
  await p.getByRole("button", { name: "Send me a one-time code" }).click();
  await p.locator("#code").fill((await p.locator("[data-otp]").innerText()).trim());
  await p.getByRole("button", { name: "Open" }).click();
  await expect(p.locator("ol.st [aria-current=step]")).toContainText("View");
  await expect(p.locator("ol.tr li.done")).toHaveCount(4);
  await sender.close(); await visitor.close();
});

test.describe("issuer", () => {
  test.use({ storageState: ISSUER_AUTH });
  test("issue: stepper through the wizard; the trail lists authority, salts, signature, registry, delivery and the ledger line", async ({ page }) => {
    await page.goto("/issuer/issue");
    await expect(page.locator(".stepper-title")).toContainText("Step 1 of 4");
    await page.locator(".profile-card").first().click();
    await expect(page.locator(".stepper-title")).toContainText("Step 2 of 4");
    await page.locator(".radio-card").first().click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator(".stepper-title")).toContainText("Step 3 of 4");
    const answers: Record<string, string> = { reg_no: "R-4004", degree: "Degree", branch: "Branch", cgpa: "8.4", year_of_passing: "2024", annual_income: "120000", issued_on: "2026-05-01", valid_until: "2027-05-01", dob: "2001-03-04", roll_no: "R-77", year: "2017", year_of_leaving: "2020" };
    for (const [k, v] of Object.entries(answers)) { const el = page.locator(`#iss-${k}`); if (await el.count()) await el.fill(v); }
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.locator(".stepper-title")).toContainText("Step 4 of 4");
    const issued = page.waitForResponse((r) => r.url().includes("/api/issuer-portal/issue"));
    await page.getByRole("button", { name: "Sign and issue" }).click();
    const body = await (await issued).json();
    expect(await stepsIn(page)).toBe(7);
    await expect(trail(page)).toContainText(`ledger line ${body.trail.ledgerSeq}`);
    await expect(trail(page)).toContainText(body.serial);
    await expect(trail(page)).toContainText("salted fingerprint");
  });
});

test("verify: the panel shows the stepper and, after asking the issuer, a five-step trail ending in a ledger line", async ({ page }) => {
  await page.goto("/verify");
  const panel = page.locator(".verify-panel").first();
  await expect(panel.locator(".stepper")).toBeVisible();
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/verify")), panel.getByRole("button").last().click()]);
  const body = await res.json();
  const tr = panel.locator("section.trail");
  await expect(tr).toBeVisible();
  expect(Number(await tr.getAttribute("data-trail-steps"))).toBeGreaterThanOrEqual(5);
  if (body.ledger_seq) await expect(tr).toContainText(`ledger line ${body.ledger_seq}`);
});

test("stop sharing: the done stepper and a trail that tested the link (refused)", async ({ page }) => {
  await page.goto("/shares");
  const card = page.locator("li.card").filter({ has: page.getByRole("button", { name: "Stop sharing" }) }).first();
  await card.getByRole("button", { name: "Stop sharing" }).click();
  await page.getByRole("dialog").getByText("Copies already downloaded cannot be recalled.").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click();
  const tr = page.locator("section.trail").first();
  await expect(tr).toContainText("Tested the link just now: refused");
  expect(Number(await tr.getAttribute("data-trail-steps"))).toBe(4);
  await expect(page.locator(".kill-done .stepper-title")).toContainText("Step 3 of 3");
});

test("eligibility: the receiver's stepper, then the owner's trail with each criterion and the ledger line", async ({ browser, baseURL }) => {
  const r = await (await browser.newContext({ baseURL, storageState: RECEIVER_AUTH, reducedMotion: "reduce" })).newPage();
  const s = await (await browser.newContext({ baseURL, storageState: AUTH_FILE, reducedMotion: "reduce" })).newPage();
  await r.goto("/receive/eligibility");
  await expect(r.locator(".stepper-title")).toContainText("Step 1 of 3");
  await r.locator(".profile-card").first().click();
  await r.getByRole("button", { name: "Send eligibility request" }).click();
  await expect(r.locator("#main").getByText(/Request sent\./)).toBeVisible();
  await s.goto("/alerts");
  // The student is told: the request is in Alerts (and in the bell).
  await expect(s.locator("#main")).toContainText("asked you to answer an eligibility check");
  const card = s.locator("li.card").filter({ hasText: "criteria for" }).first();
  await expect(card.locator(".stepper-title")).toContainText("Step 2 of 3");
  await card.locator("input[type=checkbox]").first().check();
  const answered = s.waitForResponse((x) => x.url().endsWith("/api/eligibility/answer"));
  await card.getByRole("button", { name: "Run the check and send the result" }).click();
  const body = await (await answered).json();
  const tr = s.locator("section.trail").first();
  await expect(tr).toContainText("does not give access to any document");
  await expect(tr).toContainText(`ledger line ${body.trail.ledgerSeq}`);
  expect(Number(await tr.getAttribute("data-trail-steps"))).toBe(3 + body.trail.criteria.length);
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("sign-in: the stepper and the trail of what the server has accepted so far", async ({ page }) => {
    await page.goto("/signin");
    await page.locator(".role-card.role-sender button").click();
    await expect(page.locator(".stepper-title")).toContainText("Step 1 of 3");
    await page.locator(".profile-card").first().click();
    await page.locator("[data-otp]").waitFor();
    await expect(page.locator(".stepper-title")).toContainText("Step 2 of 3");
    await expect(trail(page)).toContainText("Checked the demo number's format");
    expect(await stepsIn(page)).toBe(4);
  });
});

test("same person: answering shows a trail that says nothing was merged", async ({ page }) => {
  await page.goto("/names");
  await expect(page.locator(".stepper")).toBeVisible();
  await expect(page.locator("ol.cards > li")).toHaveCount(20);
  await page.locator(".decision button", { hasText: "Yes, same person" }).first().click();
  const tr = page.locator("section.trail").first();
  await expect(tr).toContainText("Nothing was merged");
  expect(Number(await tr.getAttribute("data-trail-steps"))).toBe(4);
});

test("leak trace: stepper, and a trail that states the watermark limit", async ({ page }) => {
  await page.goto("/leak-trace");
  await expect(page.locator(".stepper-title")).toContainText("Step 1 of 2");
  await page.locator("#lt-text").fill("no watermark in this text");
  await page.getByRole("button", { name: "Trace" }).click();
  await expect(trail(page)).toContainText("cannot stop screenshots");
  expect(await stepsIn(page)).toBe(3);
});

test.describe("keyboard", () => {
  test.use({ storageState: ISSUER_AUTH });
  test("keyboard only: the issue wizard from who to the signed paper", async ({ page }) => {
    await page.goto("/issuer/issue");
    await page.locator(".profile-card").first().waitFor();
    await page.locator(".profile-card").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".stepper-title")).toContainText("Step 2 of 4");
    await page.locator(".radio-card input").first().focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Next", exact: true }).focus();
    await page.keyboard.press("Enter");
    const answers: Record<string, string> = { reg_no: "R-5005", degree: "Degree", branch: "Branch", cgpa: "8.1", year_of_passing: "2023" };
    for (const [k, v] of Object.entries(answers)) { const el = page.locator(`#iss-${k}`); if (await el.count()) { await el.focus(); await page.keyboard.type(v); } }
    await page.getByRole("button", { name: "Review" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".stepper-title")).toContainText("Step 4 of 4");
    await page.getByRole("button", { name: "Sign and issue" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("section.trail")).toBeVisible();
  });
});
