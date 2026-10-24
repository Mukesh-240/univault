/**
 * PROPERTY TESTS (spec 16.4) — things that must hold for EVERY generated person and document.
 *   - originals never change (the engines only read; frozen inputs prove it),
 *   - nothing is ever auto-merged,
 *   - no sensitive value appears in logs or web addresses,
 *   - preview tokens carry no document values.
 * The live-database property (ledger verifies after every write) is in tests/live-db.test.ts;
 * "no raw share token is stored" is in tests/shares.test.ts.
 */
import { generateKeyPairSync } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkShowcase, makeBench, runAll } from "../eval/harness";
import { previewToken } from "../src/lib/consent";
import { candidatePairs } from "../src/lib/resolution";
import { loadPacks } from "../src/lib/rules";
import { findLeaks, logBuffer } from "../src/lib/scrub";
import { generate } from "../synthetic/generate";

const TODAY = "2026-10-25";
const packs = loadPacks();
const dev = generate({ seed: 7, set: "dev", today: TODAY });
const show = generate({ seed: 2026, set: "showcase", today: TODAY });

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

describe("properties", () => {
  it("originals never change: all engines run on frozen documents and leave them byte-identical", () => {
    for (const g of [dev, show]) {
      const b = makeBench(g.dataset, g.labels, packs);
      const before = JSON.stringify([...b.docs.values()]);
      for (const d of b.docs.values()) deepFreeze(d);
      expect(() => { runAll(b); if (g === show) checkShowcase(b); }).not.toThrow();
      expect(JSON.stringify([...b.docs.values()])).toBe(before);
    }
  });

  it("no auto-merge, ever: every candidate pair in every case has autoMerge=false", () => {
    const b = makeBench(dev.dataset, dev.labels, packs);
    let n = 0;
    for (const c of dev.labels.cases) for (const p of candidatePairs(c.refs.map((r) => b.docs.get(r)!))) { n++; expect(p.autoMerge).toBe(false); }
    for (const p of candidatePairs([...makeBench(show.dataset, show.labels, packs).docs.values()])) { n++; expect(p.autoMerge).toBe(false); }
    expect(n).toBeGreaterThan(500);
  });

  it("no sensitive value from any generated person reaches the log after running every engine", () => {
    logBuffer.splice(0);
    runAll(makeBench(dev.dataset, dev.labels, packs));
    const sensitive = dev.dataset.documents.flatMap((d) => ["name", "id_number", "dob", "reg_no", "serial", "address"].map((k) => d.fields[k]).filter((v): v is string => !!v && v.length >= 6));
    expect(findLeaks(logBuffer, sensitive)).toEqual([]);
  });

  it("web addresses carry no document data: the only query parameter any route reads is 'purpose'", () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
    walk(join(__dirname, "..", "src", "app"));
    const params = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/searchParams\.get\("([^"]+)"\)/g)].map((m) => m[1]));
    expect([...new Set(params)]).toEqual(["purpose"]);
  });

  it("preview tokens contain no document values (only a fingerprint and an expiry time)", () => {
    const k = generateKeyPairSync("ed25519");
    const priv = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    const draft = { recipient_code: "UV-R-1000", purpose: "job", fields: ["degree_certificate.degree"], expires_at: "2026-11-01T00:00:00.000Z", policy: { mode: "view_only" as const } };
    const body = Buffer.from(previewToken(draft, priv, new Date()).split(".")[0], "base64url").toString();
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(["exp", "h"]);
    expect(body).not.toContain("degree");
  });

  // "Ledger always verifies after every write" on the LIVE database is tested in tests/live-db.test.ts.
});
