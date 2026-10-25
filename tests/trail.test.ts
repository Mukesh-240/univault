/**
 * STEP TRAILS — the "what just happened" lists are built from the real result, never canned:
 *   - a passing and a failing verification give different steps;
 *   - the same result with the synthetic flag flipped (or a different person / serial around it) gives IDENTICAL steps;
 *   - no step carries a sensitive value (only counts, field NAMES, times, ids, ledger numbers);
 *   - the receiver's link trail never says whether the recipient ID or the code was the wrong detail;
 *   - every step's sentence and "why" exist in English and Telugu.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eligibilityTrail, issueTrail, killTrail, leakTrail, openTrail, shareTrail, signInTrail, verifyTrail, type TrailStep } from "../src/lib/trail";
import type { VerifyOutcome } from "../src/lib/verify";
import en from "../src/locales/en.json";
import te from "../src/locales/te.json";

const base: VerifyOutcome = {
  state: "verified", method: "hash", reason: "Matches the issuer's record.", mismatchedFields: [], checkedAt: "2026-10-25T10:42:00.000Z",
  registryVersion: 1, signatureValid: true, freshness: "fresh", mustReverifyBeforeShare: false,
  explanation: { reason: "x", confidence: 1, documentIds: [], source: "issuer", freshness: "fresh" } as unknown as VerifyOutcome["explanation"],
};
const keysOf = (s: TrailStep[]) => s.map((x) => `${x.status}:${x.text}`);

describe("verify trail is built from the result", () => {
  it("a pass and a mismatch give different steps", () => {
    const pass = verifyTrail(base, 214);
    const fail = verifyTrail({ ...base, state: "tamper_flagged", mismatchedFields: ["dob"] }, 215);
    expect(keysOf(pass)).not.toEqual(keysOf(fail));
    expect(pass.find((s) => s.text === "trail.verify.fields.match")?.status).toBe("done");
    expect(fail.find((s) => s.text === "trail.verify.fields.differ")).toMatchObject({ status: "failed", vars: { n: 1, fields: "dob" } });
    expect(pass.at(-1)).toMatchObject({ text: "trail.verify.ledger.line", vars: { seq: 214 }, evidence: { kind: "ledger", value: "214", href: "/ledger" } });
  });
  it("an unreachable issuer shows the retry schedule, never a mismatch", () => {
    const o = verifyTrail({ ...base, state: "unverifiable", signatureValid: undefined, method: "none",
      retry: { attemptsMade: 1, firstFailureAt: "2026-10-25T10:42:00.000Z", nextRetryAt: "2026-10-25T10:42:30.000Z", exhausted: false, label: "" } });
    expect(o.map((s) => s.text)).toContain("trail.verify.status.retrying");
    expect(o.some((s) => s.status === "failed" && s.text.includes("fields"))).toBe(false);
    expect(o.find((s) => s.text === "trail.verify.status.retrying")?.vars).toMatchObject({ time: "10:42", n: 2 });
  });
  it("revoked and replaced records say so", () => {
    expect(verifyTrail({ ...base, state: "revoked" }).map((s) => s.text)).toContain("trail.verify.status.revoked");
    expect(verifyTrail({ ...base, state: "superseded" }).map((s) => s.text)).toContain("trail.verify.status.superseded");
  });
});

describe("no persona, serial or synthetic-flag branching", () => {
  it("the same result with the synthetic flag flipped and a different person/serial around it gives identical steps", () => {
    const a = { ...base, synthetic: true, owner: "demo", serial: "SSU-DC-000001" } as unknown as VerifyOutcome;
    const b = { ...base, synthetic: false, owner: "someone-else", serial: "XYZ-IC-999999" } as unknown as VerifyOutcome;
    expect(verifyTrail(a, 9)).toEqual(verifyTrail(b, 9));
    const r = { verified: [{ title: "Degree certificate", state: "verified" }], fields: ["degree_certificate.cgpa"], recipient: { code: "UV-R-1000" }, ledger: [{ seq: 3, kind: "share.active" }] };
    expect(shareTrail({ ...r, synthetic: true } as never)).toEqual(shareTrail({ ...r, synthetic: false } as never));
  });
  it("trail.ts never reads a synthetic flag, a persona or a serial to decide", () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "trail.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src).not.toMatch(/synthetic|persona|DEMO_OWNER|\.serial\s*===|startsWith\("UV-R/);
  });
});

describe("no sensitive values in a trail", () => {
  it("share, issue, kill, eligibility and leak trails carry only counts, names of fields, times, ids and line numbers", () => {
    const all = [
      ...shareTrail({ verified: [{ title: "Degree certificate", state: "verified" }], fields: ["a.b", "a.c"], recipient: { code: "UV-R-1000" }, ledger: [{ seq: 10, kind: "share.drafted" }, { seq: 12, kind: "token.issued" }] }),
      ...issueTrail({ serial: "SSU-DC-123456", fieldCount: 6, salted: true, ledgerSeq: 44, sha256: "a".repeat(64) }),
      ...killTrail({ scope: "link", killed: 1, ledger: [{ seq: 50, kind: "token.killed" }], test: { outcome: "denied:revoked" } }),
      ...eligibilityTrail([{ label: "Age at least 18", result: "met", docs: ["Secondary school certificate"] }], 60),
      ...leakTrail({ found: true, recipientCode: "UV-R-1000", at: "2026-10-25T10:00:00.000Z", session: "S-1" }),
    ];
    const values = JSON.stringify(all.map((s) => [s.vars, s.evidence]));
    for (const secret of ["2003-04-05", "Anil", "http", "/s/", "482913"]) expect(values).not.toContain(secret);
    expect(issueTrail({ serial: "S", fieldCount: 1, salted: true, sha256: "f".repeat(64) }).find((s) => s.vars?.fp)?.vars?.fp).toHaveLength(12);
  });
  it("the share trail counts the ledger lines it really wrote and points at the token line", () => {
    const s = shareTrail({ verified: [{ title: "T", state: "verified" }], fields: ["a.b"], recipient: { code: "UV-R-1" }, ledger: [{ seq: 12, kind: "token.issued" }, { seq: 10, kind: "share.drafted" }] });
    expect(s.find((x) => x.text === "trail.share.ledger.lines")?.vars).toEqual({ n: 2, first: 10, last: 12 });
    expect(s.find((x) => x.text === "trail.share.link.made")?.evidence?.value).toBe("12");
    expect(shareTrail({ verified: [], fields: [], recipient: { code: "UV-R-1" }, ledger_ok: false }).some((x) => x.status === "failed")).toBe(true);
  });
});

describe("the receiver's link trail", () => {
  it("never says which of the recipient ID or the code was wrong", () => {
    const id = openTrail("denied:wrong_recipient", 3), code = openTrail("denied:wrong_code", 3);
    expect(id).toEqual(code);
    expect(id.map((s) => s.text)).toContain("trail.open.details.wrong");
  });
  it("each outcome tells a different, plain story", () => {
    const stories = ["gate", "code_issued", "allowed", "denied:killed", "denied:unintended_account", "locked", "denied:wrong_code"].map((o) => keysOf(openTrail(o)).join("|"));
    expect(new Set(stories).size).toBe(stories.length);
    expect(openTrail("allowed").every((s) => s.status === "done")).toBe(true);
  });
  it("the sign-in trail moves forward with the real stage", () => {
    expect(signInTrail("code").map((s) => s.status)).toEqual(["done", "waiting", "waiting", "waiting"]);
    expect(signInTrail("consent").map((s) => s.status)).toEqual(["done", "done", "waiting", "waiting"]);
  });
});

describe("every trail key exists in English and Telugu", () => {
  it("all keys the builders can produce are translated", () => {
    const produced = new Set<string>();
    const add = (s: TrailStep[]) => s.forEach((x) => { produced.add(x.text); produced.add(x.why); });
    add(verifyTrail(base, 1)); add(verifyTrail({ ...base, state: "tamper_flagged", mismatchedFields: ["x"], freshness: "stale" }));
    add(verifyTrail({ ...base, state: "unverifiable", signatureValid: undefined })); add(verifyTrail({ ...base, signatureValid: false }));
    add(verifyTrail({ ...base, state: "revoked" })); add(verifyTrail({ ...base, state: "superseded" }));
    add(verifyTrail({ ...base, method: "fields" }));
    add(shareTrail({ verified: [{ title: "a", state: "x" }], fields: [], recipient: { code: "c" } })); add(shareTrail({ verified: [], fields: [], recipient: { code: "c" }, ledger_ok: false }));
    add(shareTrail({ verified: [], fields: [], recipient: { code: "c" }, ledger: [{ seq: 1, kind: "token.issued" }] }));
    add(issueTrail({ serial: "s", fieldCount: 1, salted: true, sha256: "x", ledgerSeq: 1 })); add(issueTrail({ serial: "s", fieldCount: 1, salted: false, sha256: "x" }));
    add(killTrail({ scope: "link", killed: 1, test: { outcome: "denied:revoked" } })); add(killTrail({ scope: "all", killed: 0, test: { outcome: "active" } }));
    add(killTrail({ scope: "user", killed: 2, ledger: [{ seq: 1, kind: "k" }] }));
    for (const o of ["gate", "code_issued", "allowed", "denied:killed", "denied:unintended_account", "locked", "denied:wrong_code", "rate_limited"]) add(openTrail(o));
    for (const r of ["met", "not_met", "unknown"] as const) add(eligibilityTrail([{ label: "l", result: r, docs: [] }], 1));
    add(eligibilityTrail([]));
    for (const st of ["number", "code", "consent", "in"] as const) add(signInTrail(st));
    add(leakTrail({ found: true })); add(leakTrail({ found: false }));
    for (const k of produced) { expect((en as Record<string, string>)[k], k).toBeTruthy(); expect((te as Record<string, string>)[k], k).toBeTruthy(); }
  });
});
