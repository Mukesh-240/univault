/**
 * SCREENSHOTS for the README — drives the real app in Microsoft Edge and saves PNGs to docs/evidence/.
 *   Run (app must be running, e.g. `npm run build && UNIVAULT_OFFLINE_DEMO=1 npm start -- -p 3400`):
 *     npm run screenshots              (or BASE=http://host:port npm run screenshots)
 * It performs the same steps a person would: verify every document, create a share, open it as the
 * recipient, trace the watermark, verify the ledger. Nothing is staged or faked.
 */
import { mkdirSync } from "node:fs";
import { chromium, type Locator, type Page } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3400";
const OUT = "docs/evidence";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, baseURL: BASE });
  const page = await ctx.newPage();
  const shot = (name: string, target: Page | Locator = page) => target.screenshot({ path: `${OUT}/${name}.png` });

  // Verify every document first, so the vault and verification screens show real issuer results.
  const html = await (await page.request.get("/verify")).text();
  for (const id of new Set([...html.matchAll(/id="v-([0-9a-f-]{36})"/g)].map((m) => m[1])))
    await page.request.post("/api/verify", { data: { document_id: id } });

  await page.goto("/"); await shot("screen-vault");
  await page.goto("/readiness"); await shot("screen-readiness");
  await page.goto("/names"); await shot("screen-name-detective");
  await page.goto("/verify");
  await shot("screen-verification-altered-digit", page.locator("li.card").filter({ hasText: "Doesn't match issuer record" }).first());
  await page.goto("/ocr"); await shot("screen-ocr");

  // A share: preview -> confirm -> receipt.
  await page.goto("/share");
  await page.getByRole("button", { name: "Preview what they will see" }).click();
  await page.getByRole("button", { name: "Confirm and share" }).click();
  const receipt = page.locator("section").filter({ has: page.getByRole("heading", { name: "Share receipt" }) });
  await receipt.waitFor();
  await shot("screen-share-receipt", receipt);
  const link = await page.getByLabel("Their personal link").inputValue();
  const recipientId = (await page.locator(".receipt dd code").first().innerText()).trim();

  // The recipient opens it on their own device.
  const rctx = await browser.newContext({ viewport: { width: 900, height: 860 } });
  const r = await rctx.newPage();
  await r.goto(link);
  await r.getByLabel("Recipient ID").fill(recipientId);
  await r.getByRole("button", { name: "Send me a one-time code" }).click();
  await shot("screen-recipient-gate", r);
  await r.getByLabel("One-time code").fill((await r.locator("[data-otp]").innerText()).trim());
  await r.getByRole("button", { name: "Open" }).click();
  await shot("screen-recipient-view", r);
  const watermark = (await r.locator("[data-watermark]").innerText()).trim();

  // Leak trace from the watermark text.
  await page.goto("/leak-trace");
  await page.getByLabel("Watermark text").fill(watermark);
  await page.getByRole("button", { name: "Trace" }).click();
  await page.getByRole("heading", { name: "Result" }).waitFor();
  await shot("screen-leak-trace");

  // Shares: the consent ledger card with access history, "Kill this link" and "Test this link now".
  await page.goto("/shares");
  await shot("screen-shares", page.locator("li.card").first());

  // Fault panel: issuer timeout switched on, then off again (the switch is recorded in the ledger).
  await page.goto("/faults");
  const timeout = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Issuer timeout" }) });
  await timeout.getByRole("button", { name: "Turn fault on" }).click();
  await timeout.getByText("Issuer is now unreachable").waitFor();
  await shot("screen-faults", timeout);
  await timeout.getByRole("button", { name: "Turn fault off" }).click();
  await timeout.getByText("Issuer is reachable again").waitFor();

  // Ledger verify.
  await page.goto("/ledger");
  await page.getByRole("button", { name: "Verify ledger now" }).click();
  await page.locator("#live-region").filter({ hasText: "Ledger intact" }).waitFor();
  await shot("screen-ledger-verify");

  await browser.close();
  console.info(`Screenshots saved to ${OUT}/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
