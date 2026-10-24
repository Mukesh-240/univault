/**
 * PHASE 9 / P0.7, P0.9, P0.10 — SOURCE SCANS. In plain words:
 *   - nothing prints with console.* except scrub.ts, so every log line goes through log() and its scrubber;
 *   - the sentences we promised never to say do not appear anywhere (UI strings, README, docs, public files), and
 *     "zero-knowledge" appears only when it is being denied;
 *   - mismatch messages never accuse anyone (fake, forged, fraud, tampered); the few exceptions are in
 *     tests/wording-allowlist.json, each with a reason;
 *   - every kind of event the final feature list names (share, request, consent, access attempt, kill, verification,
 *     correction, erasure) is written to the ledger somewhere in the code.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = (p: string) => p.slice(ROOT.length + 1).split(sep).join("/");
const read = (p: string) => readFileSync(p, "utf8");
const SRC = walk(join(ROOT, "src"));
const allow = JSON.parse(read(join(__dirname, "wording-allowlist.json"))) as { accusing: { file: string; key: string }[]; text: { file: string; word: string }[] };

describe("P0.7 logging goes through log()", () => {
  it("no console.* and no direct stdout writes outside scrub.ts", () => {
    const bad = SRC.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("scrub.ts")).filter((f) => /console\.(log|info|warn|error|debug)|process\.(stdout|stderr)\.write/.test(read(f)));
    expect(bad.map(rel)).toEqual([]);
  });
});

describe("P0.9 wording", () => {
  const DOCS = [...SRC, ...walk(join(ROOT, "docs")).filter((f) => f.endsWith(".md") && !/GAP_AUDIT|FINAL_FEATURES/.test(f)), ...walk(join(ROOT, "public")).filter((f) => /\.(md|txt|html|json|svg)$/.test(f)), join(ROOT, "README.md"), join(ROOT, "DEPLOY.md")];
  const BANNED: [RegExp, string][] = [
    [/secure cloud storage/i, "secure cloud storage"], [/100% true/i, "100% true"], [/no fake accounts/i, "no fake accounts"],
    [/connected to (RTO|DigiLocker|Aadhaar)/i, "connected to RTO/DigiLocker/Aadhaar"], [/(^|[^a-z])prevents screenshots?/i, "prevents screenshots"],
    [/(^|[^a-z])recalls (the )?(downloaded|copies)/i, "recalls downloaded copies"], [/identity percentage/i, "identity percentage"],
  ];
  it("the banned sentences appear nowhere", () => {
    const hits: string[] = [];
    for (const f of DOCS) { const t = read(f); for (const [re, name] of BANNED) if (re.test(t)) hits.push(`${rel(f)}: ${name}`); }
    expect(hits).toEqual([]);
  });
  it("zero-knowledge is only ever mentioned to deny it", () => {
    const hits: string[] = [];
    for (const f of DOCS) for (const line of read(f).split("\n")) {
      for (const m of line.matchAll(/zero-knowledge/gi)) if (!/(not|never|isn't|no|without|n't)\W+(\w+\W+){0,3}$/i.test(line.slice(Math.max(0, m.index! - 40), m.index!))) hits.push(`${rel(f)}: ${line.trim().slice(0, 90)}`);
    }
    expect(hits).toEqual([]);
  });
  it("mismatch messages never accuse (fake, forged, fraud, tampered), except the listed, reasoned exceptions", () => {
    const en = JSON.parse(read(join(ROOT, "src", "locales", "en.json"))) as Record<string, string>;
    const allowedKeys = new Set(allow.accusing.map((a) => a.key));
    const ACCUSE = /\b(fake|forged|forgery|fraud|fraudulent|tampered|tampered-by)\b/i;
    const bad = Object.entries(en).filter(([k, v]) => /^(verify|doc|vault|state|status|share|alert|notify|recv|issuer)\./.test(k) && ACCUSE.test(v) && !allowedKeys.has(k)).map(([k]) => k);
    expect(bad).toEqual([]);
    const issuer = read(join(ROOT, "src", "lib", "issuer.ts"));
    for (const m of issuer.matchAll(/reason:\s*[`"]([^`"]*)/g)) expect(m[1], m[1]).not.toMatch(ACCUSE);
    expect(allow.accusing.every((a) => (a as { reason?: string }).reason)).toBe(true);
  });
  it("the neutral mismatch sentence is the one the brief gives", () => {
    expect(read(join(ROOT, "src", "lib", "issuer.ts"))).toContain("doesn't match the issuer's record in");
    expect(read(join(ROOT, "src", "lib", "issuer.ts"))).toContain("scanning or typing mistake");
  });
});

describe("P0.10 every kind of event writes a ledger line", () => {
  const code = SRC.filter((f) => /\.(ts|tsx)$/.test(f)).map(read).join("\n");
  const EVENTS: [string, RegExp][] = [
    ["share (drafted, previewed, confirmed, active, revoked, expired)", /append\(db, `share\.\$\{state\}`/],
    ["request (sent and checked)", /"request\.sent"[\s\S]*"request\.checked"|"request\.checked"[\s\S]*"request\.sent"/],
    ["consent / confirmation of a share", /shareEvent\(db, share\.id, "confirmed"/],
    ["access attempts (allowed, denied, locked)", /append\(db, `access\./],
    ["kill (link and token states)", /tokenEvent\(db, [a-zA-Z.]+, "killed"|"killed"/],
    ["verification", /"document\.verification"/],
    ["correction / override / dispute", /append\(supabase, `feedback\.\$\{action\}`/],
    ["erasure", /"document\.erased"/],
    ["issuer issued / replaced / stopped", /"issuer\.issued"[\s\S]*"issuer\.superseded"[\s\S]*"issuer\.revoked"|"issuer\.revoked"/],
    ["receiver report", /"receiver\.reported"/],
  ];
  for (const [name, re] of EVENTS) it(`${name} writes a ledger line`, () => expect(re.test(code), name).toBe(true));
});
