import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge" });
const out = process.env.TEMP + "/p7/";
for (const [name, w, h, state, path] of [["signin-d", 1440, 900, undefined, "/signin"], ["signin-m", 390, 844, undefined, "/signin"], ["home-d", 1440, 900, "e2e-results/auth.json", "/"]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", baseURL: "http://localhost:3400", storageState: state });
  const p = await c.newPage(); await p.goto(path); await p.waitForTimeout(2500);
  await p.screenshot({ path: out + name + ".png" }); await c.close();
}
await b.close();
