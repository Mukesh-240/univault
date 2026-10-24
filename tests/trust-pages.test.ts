/**
 * TRUST PAGES tests. In plain words: the threat model and the policy page may only claim what the
 * repo really backs —
 *   - every file a row or section cites exists;
 *   - every threat row cites at least one test (tests/ or e2e/) and at least one code or schema file;
 *   - the threat list covers every threat the brief asks for, and every heading has an English and a
 *     Telugu label;
 *   - the numbers the policy states (30 days, 10 minutes, 15 minutes, 24 hours, one year) are the
 *     numbers in the code, so the page can't drift from what the app does.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../src/locales/en.json";
import te from "../src/locales/te.json";
import { CODE_TTL_MS, DOWNLOAD_PASS_TTL_MS, LOCK_MS, MAX_SHARE_DAYS, MAX_WRONG_CODES } from "../src/lib/shares";
import { RECIPIENT_LIMITS } from "../src/lib/rate-limit";
import { POLICY, THREATS } from "../src/lib/trust-pages";
import { STALE_AFTER_HOURS } from "../src/lib/verify";

const root = join(__dirname, "..");
const isTest = (p: string) => p.startsWith("tests/") || p.startsWith("e2e/");

describe("threat model", () => {
  it("every cited file exists, and every row cites a test and some code", () => {
    for (const r of THREATS) {
      for (const p of r.evidence) expect(existsSync(join(root, p)), `${r.key}: ${p}`).toBe(true);
      expect(r.evidence.some(isTest), `${r.key} cites a test`).toBe(true);
      expect(r.evidence.some((p) => !isTest(p)), `${r.key} cites code`).toBe(true);
    }
  });

  it("covers every threat the brief lists, each with English and Telugu labels", () => {
    expect(THREATS.map((r) => r.key)).toEqual(["forged", "editedOriginal", "tamperedLedger", "forwardedLink", "screenshot", "stolenToken", "bruteForce",
      "wrongMerge", "ocrMisread", "staleVerification", "maliciousUpload", "noLogin", "simulatedIssuer", "notZeroKnowledge"]);
    for (const r of THREATS) {
      expect((en as Record<string, string>)[`threat.row.${r.key}`], r.key).toBeTruthy();
      expect((te as Record<string, string>)[`threat.row.${r.key}`], r.key).toBeTruthy();
      expect(r.stops.length && r.notStopped.length).toBeTruthy();
    }
  });

  it("the brute-force row states the limits the code enforces", () => {
    const row = THREATS.find((r) => r.key === "bruteForce")!.stops;
    expect(row).toContain(`${MAX_WRONG_CODES === 5 ? "Five" : MAX_WRONG_CODES} wrong one-time codes in a row lock the link for ${LOCK_MS / 60_000} minutes`);
    expect(row).toContain(`may make ${RECIPIENT_LIMITS.perIp.max} recipient requests a minute and each link ${RECIPIENT_LIMITS.perToken.max}`);
  });
});

describe("policy page", () => {
  it("every cited file exists and every section has a translated heading", () => {
    for (const s of POLICY) {
      for (const p of s.evidence) expect(existsSync(join(root, p)), `${s.key}: ${p}`).toBe(true);
      expect((te as Record<string, string>)[`policy.section.${s.key}`], s.key).toBeTruthy();
    }
  });

  it("the time limits it states are the ones in the code", () => {
    const text = POLICY.find((s) => s.key === "retention")!.paragraphs.join(" ");
    expect(text).toContain(`at most ${MAX_SHARE_DAYS} days`);
    expect(text).toContain(`${CODE_TTL_MS / 60_000} minutes and works once`);
    expect(text).toContain(`${MAX_WRONG_CODES} wrong codes in a row lock a link for ${LOCK_MS / 60_000} minutes`);
    expect(text).toContain(`download pass lasts ${DOWNLOAD_PASS_TTL_MS / 60_000} minutes`);
    expect(text).toContain(`fresh for ${STALE_AFTER_HOURS} hours`);
    // The device cookie's Max-Age (one year) in the recipient route.
    expect(readFileSync(join(root, "src/app/s/[token]/route.ts"), "utf8")).toContain("Max-Age=31536000");
    expect(text).toContain("device cookie lasts one year");
  });

  it("the erase section matches the erase route: content deleted, cover record kept, shares revoked first", () => {
    const route = readFileSync(join(root, "src/app/api/erase/route.ts"), "utf8");
    expect(route).toContain(`from("document_payloads").delete()`);
    expect(route).toContain(`killShare(supabase, s.id, "document erased")`);
    const text = POLICY.find((s) => s.key === "erase")!.paragraphs.join(" ");
    expect(text).toContain("revokes every active share");
    expect(text).toContain("Kept: the cover record");
  });
});
