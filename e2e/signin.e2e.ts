/**
 * SIGN-IN AND DISPLAY JOURNEYS — the simulated Aadhaar sign-in through the real screens, in English and in
 * Telugu, plus the display controls:
 *   - signed out: pages go to /signin, APIs answer 401, the public pages (/policy, /threat-model) stay open;
 *   - the full 3-step sign-in with the prefilled demo number, then Home greets the person by name, Profile
 *     shows only the masked number, Sign out returns to /signin;
 *   - a number that does not start with 0000 is refused in plain words;
 *   - 5 wrong codes lock that number (and a new code is refused while locked);
 *   - a browser whose first language is Telugu gets Telugu on a first visit;
 *   - "Need help?" opens the 3-step panel for the screen; Text size A+ and High contrast change the page
 *     and are remembered after a reload; an A+ walk from Home to the share wizard still works.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { generate } from "../src/lib/synthetic-aadhaar";

const te = JSON.parse(readFileSync("src/locales/te.json", "utf8")) as Record<string, string>;
const signedOut = { cookies: [], origins: [] };

/** Type a 6-digit code into the six boxes. */
async function typeCode(page: Page, code: string, label: (n: number) => string) {
  for (let i = 1; i <= 6; i++) await page.getByLabel(label(i)).fill(code[i - 1]);
}
const digit = (n: number) => `Digit ${n} of 6`;
const wrongOf = (code: string) => code.slice(0, 5) + ((Number(code[5]) + 1) % 10);

test.describe("signed out", () => {
  test.use({ storageState: signedOut });

  test("pages go to /signin, APIs answer 401, the trust pages stay open", async ({ page, request }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.locator("h1")).toHaveText("Sign in");
    expect((await request.get("/api/notifications")).status()).toBe(401);
    expect((await request.post("/api/upload", { data: {} })).status()).toBe(401);
    expect((await request.get("/api/health")).status()).toBe(200);
    expect((await page.goto("/policy"))?.status()).toBe(200);
    expect((await page.goto("/threat-model"))?.status()).toBe(200);
    expect((await page.goto("/s/not-a-real-link"))?.status()).toBe(403); // the recipient door is its own gate
  });

  test("English: three steps, then Home greets by name; Profile shows only the masked number; Sign out", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByText("Simulated sign-in. No real Aadhaar or government service is used.")).toBeVisible();
    const number = (await page.locator("#aad").inputValue()).replace(/\s/g, "");
    expect(number).toMatch(/^0000\d{8}$/);
    await expect(page.getByRole("heading", { name: "Enter your demo Aadhaar number" })).toBeVisible();
    await page.getByRole("button", { name: "Send me a code" }).click();

    await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
    await expect(page.getByText("SIMULATED: no SMS is sent.")).toBeVisible();
    const code = (await page.locator("[data-otp]").innerText()).trim();
    expect(code).toMatch(/^\d{6}$/);
    await typeCode(page, code, digit);
    await page.getByRole("button", { name: "Check the code" }).click();

    await expect(page.getByRole("heading", { name: "Allow UNIVAULT to see" })).toBeVisible();
    await expect(page.locator(".record-card")).toContainText("XXXX XXXX");
    await expect(page.locator(".record-card")).not.toContainText(number);
    await page.getByRole("button", { name: "Allow" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toContainText("Namaste, ");
    await page.getByRole("button", { name: "Profile" }).click();
    await expect(page.locator(".pop")).toContainText(`XXXX XXXX ${number.slice(-4)}`);
    expect(await page.locator("body").innerText()).not.toContain(number);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/signin$/);
    await page.goto("/shares");
    await expect(page).toHaveURL(/\/signin$/);
  });

  test("a number that does not start with 0000 is refused in plain words", async ({ page }) => {
    await page.goto("/signin");
    await page.locator("#aad").fill("2345 6789 0123");
    await expect(page.locator("#aad-msg")).toHaveText("This prototype only accepts demo numbers that start with 0000");
    await page.getByRole("button", { name: "Send me a code" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("This prototype only accepts demo numbers that start with 0000");
    await expect(page.getByRole("heading", { name: "Enter your demo Aadhaar number" })).toBeVisible();
    // One changed digit of a valid demo number is caught too.
    const good = generate();
    const bad = good.slice(0, 11) + ((Number(good[11]) + 1) % 10);
    await page.locator("#aad").fill(bad);
    await expect(page.locator("#aad-msg")).toContainText("This number is not correct");
    // "Use a demo number" fills a valid one.
    await page.getByRole("button", { name: "Use a demo number" }).click();
    expect((await page.locator("#aad").inputValue()).replace(/\s/g, "")).toMatch(/^0000\d{8}$/);
  });

  test("5 wrong codes lock the number; a new code is refused while locked", async ({ page }) => {
    await page.goto("/signin");
    await page.locator("#aad").fill(generate());
    await page.getByRole("button", { name: "Send me a code" }).click();
    const code = (await page.locator("[data-otp]").innerText()).trim();
    for (let i = 1; i <= 4; i++) {
      await typeCode(page, wrongOf(code), digit);
      await page.getByRole("button", { name: "Check the code" }).click();
      await expect(page.locator("p[role=alert]")).toContainText(`You have ${5 - i} tries left`);
    }
    await typeCode(page, wrongOf(code), digit);
    await page.getByRole("button", { name: "Check the code" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("locked");
    // Even the right code is refused now, and so is asking for a new one.
    await typeCode(page, code, digit);
    await page.getByRole("button", { name: "Check the code" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("locked");
    await page.getByRole("button", { name: "Send a new code" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("locked");
  });

  test("Telugu: the whole sign-in in Telugu", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "uv_lang", value: "te", url: baseURL! }]);
    await page.goto("/signin");
    await expect(page.locator("html")).toHaveAttribute("lang", "te");
    await expect(page.locator("h1")).toHaveText(te["signin.title"]);
    await expect(page.getByText(te["signin.banner"])).toBeVisible();
    await expect(page.getByRole("heading", { name: te["signin.step1.title"] })).toBeVisible();
    await page.getByRole("button", { name: te["signin.sendCode"] }).click();
    await expect(page.getByRole("heading", { name: te["signin.step2.title"] })).toBeVisible();
    const code = (await page.locator("[data-otp]").innerText()).trim();
    await typeCode(page, code, (n) => te["signin.digit"].replace("{n}", String(n)).replace("{total}", "6"));
    await page.getByRole("button", { name: te["signin.checkCode"] }).click();
    await expect(page.getByRole("heading", { name: te["signin.step3.title"] })).toBeVisible();
    await page.getByRole("button", { name: te["signin.allow"] }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toContainText("నమస్తే");
  });

  test("a first visit from a Telugu browser opens in Telugu", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, locale: "te-IN", storageState: signedOut });
    const p = await ctx.newPage();
    await p.goto("/signin");
    await expect(p.locator("html")).toHaveAttribute("lang", "te");
    await expect(p.locator("h1")).toHaveText(te["signin.title"]);
    await ctx.close();
  });

  test("Need help? opens 3 steps for the sign-in screen, and Escape closes it", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: "Need help?" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Help: signing in" })).toBeVisible();
    await expect(dialog.locator("li")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Need help?" })).toBeFocused();
  });
});

test.describe("signed in", () => {
  test("Text size A+ and High contrast change the page and are remembered", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBe(20);
    await page.getByRole("button", { name: "Text size" }).click();
    await page.getByRole("button", { name: "Larger text" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-size", "150");
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBe(30);
    await page.getByLabel("High contrast").check();
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-size", "150");
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  });

  test("A+ journey: Home -> a document -> Share a part of this -> the wizard", async ({ page }) => {
    await page.context().addCookies([{ name: "uv_size", value: "150", url: page.url() === "about:blank" ? "http://localhost:3100" : page.url() }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-size", "150");
    await page.getByRole("link", { name: /^Open: / }).first().click();
    await expect(page).toHaveURL(/\/doc\//);
    await expect(page.getByRole("heading", { name: "What this document says" })).toBeVisible();
    await page.getByRole("link", { name: "Share a part of this" }).click();
    await expect(page).toHaveURL(/\/share\?from=/);
    await expect(page.getByRole("heading", { name: "Who is asking?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("the five tabs and the menu exist; help opens for the screen", async ({ page }) => {
    await page.goto("/shares");
    await page.getByRole("button", { name: "Need help?" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Help: my shares" })).toBeVisible();
    await page.keyboard.press("Escape");
    for (const [path, h1] of [["/alerts", "Alerts"], ["/more", "More"], ["/add", "Add a document"]] as const) {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveText(h1);
    }
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");
    const tabs = page.getByRole("navigation", { name: "Main menu" }).getByRole("link");
    await expect(tabs).toHaveText(["Home", "Ready?", "Shares", "Alerts", "More"]);
  });
});
