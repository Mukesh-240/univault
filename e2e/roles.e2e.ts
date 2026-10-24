/**
 * ROLE JOURNEYS — the three kinds of account through the real screens:
 *   - an ISSUER signs in, issues a document through the 4-step wizard (it is signed on the server), and the SENDER
 *     (the holder) finds it in the vault and checks it with the issuer: verified. The issuer then stops it, and the
 *     holder next check says "Not accepted";
 *   - the guards: an issuer cannot open the vault, a sender cannot open the issuer area, a receiver cannot open
 *     the vault; each is sent to a clear "This area is for ..." page;
 *   - the same issuing journey in Telugu.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Browser } from "@playwright/test";
import { AUTH_FILE, ISSUER_AUTH, RECEIVER_AUTH } from "./global-setup";

const te = JSON.parse(readFileSync("src/locales/te.json", "utf8")) as Record<string, string>;

/** Fill the degree-certificate boxes (the first kind offered) with plain valid answers. */
async function fillAndSign(page: import("@playwright/test").Page, labels: { next: string; review: string; sign: string }) {
  await page.locator(".profile-card").first().click();
  await page.locator(".radio-card").first().click();
  await page.getByRole("button", { name: labels.next, exact: true }).click();
  const answers: Record<string, string> = { reg_no: "R-4004", degree: "Degree", branch: "Branch", cgpa: "8.4", year_of_passing: "2024", annual_income: "120000", issued_on: "2026-05-01", valid_until: "2027-05-01", dob: "2001-03-04", roll_no: "R-77", year: "2017", conduct_unused: "", year_of_leaving: "2020" };
  for (const [k, v] of Object.entries(answers)) { const el = page.locator(`#iss-${k}`); if (await el.count()) await el.fill(v); }
  const choice = page.locator(".radio-cards input[type=radio]").first();
  if (await choice.count() && !(await page.locator(".issue-split .radio-card").first().isHidden())) await page.locator(".issue-split .radio-card").first().click();
  await page.getByRole("button", { name: labels.review }).click();
  const issued = page.waitForResponse((r) => r.url().includes("/api/issuer-portal/issue") && r.request().method() === "POST");
  await page.getByRole("button", { name: labels.sign }).click();
  return (await (await issued).json()) as { serial: string; documentId: string };
}

async function senderPage(browser: Browser, baseURL: string | undefined) {
  const ctx = await browser.newContext({ baseURL, storageState: AUTH_FILE, reducedMotion: "reduce" });
  return { ctx, page: await ctx.newPage() };
}

test.describe("issuer", () => {
  test.use({ storageState: ISSUER_AUTH });

  test("issuer issues -> holder sees it and checks it: verified -> issuer stops it -> holder check: not accepted", async ({ page, browser, baseURL }) => {
    await page.goto("/issuer");
    await expect(page.getByRole("link", { name: "Issue a document" }).first()).toBeVisible();
    await page.goto("/issuer/issue");
    await expect(page.getByRole("heading", { name: "Who is it for?" })).toBeVisible();
    const out = await fillAndSign(page, { next: "Next", review: "Review", sign: "Sign and issue" });
    await expect(page.getByRole("heading", { name: "Signed and issued" })).toBeVisible();
    await expect(page.locator(".paper .seal")).toBeVisible();

    const { ctx, page: holder } = await senderPage(browser, baseURL);
    await holder.goto(`/doc/${out.documentId}`);
    await expect(holder.getByRole("heading", { name: "What this document says" })).toBeVisible();
    await holder.getByRole("button", { name: "Check with the issuer" }).first().click();
    await expect(holder.locator(".card").filter({ hasText: "Checked with the issuer" }).locator(".chip").first()).toContainText("Verified", { timeout: 20_000 });

    await page.goto("/issuer/issued");
    const card = page.locator("li.card").filter({ hasText: out.serial });
    await expect(card).toContainText("Active");
    await card.getByRole("button", { name: "Stop this document" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Stop this document" }).click();
    await expect(page.locator("li.card").filter({ hasText: out.serial })).toContainText("Stopped", { timeout: 20_000 });

    await holder.goto(`/doc/${out.documentId}`);
    await holder.getByRole("button", { name: "Check again" }).click();
    await expect(holder.locator(".card").filter({ hasText: "Checked with the issuer" }).locator(".chip").first()).toContainText("Not accepted", { timeout: 20_000 });
    await ctx.close();
  });

  test("an issuer cannot open the vault and is told whose area it is", async ({ page, request }) => {
    await page.goto("/shares");
    await expect(page).toHaveURL(/\/area\?for=sender/);
    await expect(page.getByRole("heading", { name: "This area is for senders" })).toBeVisible();
    expect((await request.get("/api/notifications")).status()).toBe(403);
    await page.goto("/");
    await expect(page).toHaveURL(/\/issuer$/);
  });
});

test.describe("guards for the other roles", () => {
  test("a sender cannot open the issuer area; a receiver cannot open the vault", async ({ page, browser, baseURL }) => {
    await page.goto("/issuer");
    await expect(page).toHaveURL(/\/area\?for=issuer/);
    const ctx = await browser.newContext({ baseURL, storageState: RECEIVER_AUTH, reducedMotion: "reduce" });
    const r = await ctx.newPage();
    await r.goto("/shares");
    await expect(r).toHaveURL(/\/area\?for=sender/);
    expect((await ctx.request.get("/api/notifications")).status()).toBe(403);
    await ctx.close();
  });
});

test.describe("issuer in Telugu", () => {
  test.use({ storageState: ISSUER_AUTH });
  test("the same issuing journey works in Telugu", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "uv_lang", value: "te", url: baseURL! }]);
    await page.goto("/issuer/issue");
    await expect(page.getByRole("heading", { name: te["issuer.wiz.1.title"] })).toBeVisible();
    await fillAndSign(page, { next: te["issuer.wiz.next"], review: te["issuer.wiz.review"], sign: te["issuer.wiz.sign"] });
    await expect(page.getByRole("heading", { name: te["issuer.done.title"] })).toBeVisible();
  });
});

test.describe("the whole story", () => {
  test("issuer issues -> sender verifies -> receiver asks -> sender shares from the request -> receiver opens, reports -> sender stops sharing", async ({ browser, baseURL }) => {
    const open = async (state: string) => { const ctx = await browser.newContext({ baseURL, storageState: state, reducedMotion: "reduce" }); return { ctx, page: await ctx.newPage() }; };
    const issuer = await open(ISSUER_AUTH), sender = await open(AUTH_FILE), receiver = await open(RECEIVER_AUTH);

    // 1. The issuer issues; 2. the holder checks it: verified.
    await issuer.page.goto("/issuer/issue");
    const out = await fillAndSign(issuer.page, { next: "Next", review: "Review", sign: "Sign and issue" });
    await sender.page.goto(`/doc/${out.documentId}`);
    await sender.page.getByRole("button", { name: "Check with the issuer" }).first().click();
    await expect(sender.page.locator(".card").filter({ hasText: "Checked with the issuer" }).locator(".chip").first()).toContainText("Verified", { timeout: 20_000 });

    // 3. The receiver asks for degree-certificate items.
    const rp = receiver.page;
    await rp.goto("/receive/ask");
    await rp.locator(".profile-card").first().click();
    await rp.locator('fieldset:has(legend:text-is("Degree certificate")) input[type=checkbox]').first().check();
    await rp.getByRole("button", { name: "Send request" }).click();
    await expect(rp.getByRole("heading", { name: "Request sent" })).toBeVisible();
    await rp.goto("/receive/requests");
    await expect(rp.locator("li.card").first()).toContainText("Waiting");

    // 4. The sender sees the request on Alerts and shares from it.
    const sp = sender.page;
    await sp.goto("/alerts");
    await expect(sp.getByRole("heading", { name: "Requests for you" })).toBeVisible();
    await sp.getByRole("link", { name: "Share these" }).first().click();
    await expect(sp).toHaveURL(/\/share\?to=UV-R-/);
    await sp.getByRole("button", { name: "Next" }).click();
    await sp.getByRole("button", { name: "Next" }).click();
    await sp.getByRole("button", { name: "Review what they will see" }).click();
    await expect(sp.getByRole("heading", { name: "Review and send" })).toBeVisible({ timeout: 60_000 });
    await sp.getByRole("button", { name: "Share now" }).click();
    await expect(sp.getByRole("heading", { name: "Your share is ready" })).toBeVisible({ timeout: 60_000 });

    // 5. The receiver opens it: banner, only approved items, watermark; the request is answered; a report is sent.
    await rp.goto("/receive");
    const openLink = rp.locator("a[href^='/receive/']").filter({ hasText: "Open" }).first();
    await openLink.click();
    await expect(rp.locator(".verified-banner")).toContainText("Checked with the issuer at");
    await expect(rp.locator("[data-watermark]")).toContainText("UV-R-");
    const viewUrl = rp.url();
    await rp.goto("/receive/requests");
    await expect(rp.locator("li.card").first()).toContainText("Answered");
    await rp.goto(viewUrl);
    await rp.getByRole("button", { name: "Report a problem" }).click();
    await rp.getByLabel("The information looks wrong").check();
    await rp.getByRole("button", { name: "Send report" }).click();
    await expect(rp.locator("#main").getByText("Thank you. The sender has been told.")).toBeVisible();
    await sp.goto("/alerts");
    await expect(sp.getByRole("heading", { name: "Problems reported to you" })).toBeVisible();

    // 6. The sender stops sharing; the receiver can no longer open it; the history still verifies.
    await sp.goto("/shares");
    await sp.getByRole("button", { name: "Stop sharing" }).first().click();
    const stopped = sp.waitForResponse((x) => x.url().includes("/api/shares/kill"));
    await sp.getByRole("dialog").getByRole("button", { name: "Stop sharing" }).click();
    await stopped;
    await rp.goto(viewUrl);
    await expect(rp.getByRole("heading", { name: "The sender has stopped sharing this." })).toBeVisible();
    const ledger = await sender.ctx.request.get("/api/ledger");
    expect((await ledger.json()).ok).toBe(true);
    await issuer.ctx.close(); await sender.ctx.close(); await receiver.ctx.close();
  });

  test("a receiver cannot open another receiver's share, and a sender in Receiving mode has no inbox", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, storageState: RECEIVER_AUTH, reducedMotion: "reduce" });
    const r = await ctx.newPage();
    await r.goto("/receive/00000000-0000-4000-8000-000000000000");
    await expect(r.getByRole("heading", { name: "This share is not available to you." })).toBeVisible();
    await ctx.close();
    const s = await browser.newContext({ baseURL, storageState: AUTH_FILE, reducedMotion: "reduce" });
    const p = await s.newPage();
    await p.goto("/receive");
    await expect(p.getByRole("heading", { name: "This account has no inbox" })).toBeVisible();
    await s.close();
  });
});
