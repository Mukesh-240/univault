/**
 * ELIGIBILITY CHECK tests (src/lib/eligibility.ts). In plain words:
 *   - only clear evidence can say "not met": missing, expired, conflicting or unverified evidence is always "unknown";
 *   - only the criteria the holder AUTHORISED are evaluated and shown; the others never appear;
 *   - the answer is signed by UNIVAULT, a changed answer fails the signature, and the answer says it is not proof;
 *   - the answer carries no document value, id or file (consenting to a check gives no access to any document);
 *   - the wording is ready / not ready under these criteria, never "eligible";
 *   - a request is answered once; a decline is recorded; another receiver cannot read the answer;
 *   - every step is a ledger line, and the ledger still verifies.
 */
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { answerEligibility, attestationValid, declineEligibility, eligibilityRequests, eligibilityResult, NOT_PROOF, requestEligibility, toCriterion } from "../src/lib/eligibility";
import { verify } from "../src/lib/ledger";
import { newStore, offlineClient } from "../src/lib/offline-db";
import { loadPacks } from "../src/lib/rules";
import { seedDataset } from "../src/lib/seed";
import { contextFor, loadVault } from "../src/lib/vault";
import { generate } from "../synthetic/generate";

const k = generateKeyPairSync("ed25519");
const PRIV = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const PUB = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const pack = loadPacks()[0];

async function world() {
  const db = offlineClient(newStore()) as unknown as SupabaseClient;
  await seedDataset(db, generate({ seed: 2026, set: "showcase", today: "2026-10-24" }).dataset, PRIV);
  return { db, ctx: await loadVault(db, "demo", "2026-10-24") };
}

describe("met / not met / unknown", () => {
  it("only clear evidence says not met", () => {
    expect(toCriterion("pass", "verified", ["d"])).toBe("met");
    expect(toCriterion("fail", "age_at_least", ["d"])).toBe("not_met");
    expect(toCriterion("fail", "age_at_least", [])).toBe("unknown");   // no document: missing evidence
    for (const p of ["doc_exists", "verified", "not_expired", "name_consistent", "scan_confirmed"]) expect(toCriterion("fail", p, ["d"]), p).toBe("unknown");
    expect(toCriterion("unknown", "verified", ["d"])).toBe("unknown");
  });
  it("an empty vault gives unknown for everything, never not met", async () => {
    const { db } = await world();
    const r = await requestEligibility(db, { from: "UV-R-1000", to: "demo", purpose: pack.purpose });
    if (!r.ok) throw new Error(r.error);
    const a = await answerEligibility(db, { holder: "demo", requestId: r.id, authorised: pack.rules.map((x) => x.id), ctx: contextFor([], "2026-10-24"), privB64: PRIV });
    if (!a.ok) throw new Error(a.error);
    expect(a.attestation.results.every((x) => x.result === "unknown")).toBe(true);
    expect(a.attestation.overall).toBe("needs_confirmation");
  });
});

describe("the pipeline", () => {
  it("evaluates only authorised criteria, signs, carries no document data, and uses the right words", async () => {
    const { db, ctx } = await world();
    const r = await requestEligibility(db, { from: "UV-R-1000", to: "demo", purpose: pack.purpose });
    if (!r.ok) throw new Error(r.error);
    const one = pack.rules[0].id;
    const a = await answerEligibility(db, { holder: "demo", requestId: r.id, authorised: [one], ctx, privB64: PRIV });
    if (!a.ok) throw new Error(a.error);
    expect(a.attestation.results.map((x) => x.rule_id)).toEqual([one]);
    expect(attestationValid(a.attestation, a.signature, PUB)).toBe(true);
    expect(attestationValid({ ...a.attestation, overall: "ready" === a.attestation.overall ? "not_ready" : "ready" }, a.signature, PUB)).toBe(false);
    expect(a.attestation.statement).toBe(NOT_PROOF);
    const text = JSON.stringify(a.attestation);
    for (const d of ctx.docs) { expect(text).not.toContain(d.id); for (const v of Object.values(d.fields)) if (v.length >= 6) expect(text).not.toContain(v); }
    expect(text).not.toMatch(/eligible/i);
    expect((await verify(db)).ok).toBe(true);
  });
  it("is answered once, can be declined, and only the asking receiver can read the answer", async () => {
    const { db, ctx } = await world();
    const r = await requestEligibility(db, { from: "UV-R-1000", to: "demo", purpose: pack.purpose });
    const r2 = await requestEligibility(db, { from: "UV-R-1000", to: "demo", purpose: pack.purpose });
    if (!r.ok || !r2.ok) throw new Error("request failed");
    const base = { holder: "demo", ctx, privB64: PRIV, authorised: [pack.rules[0].id] };
    expect((await answerEligibility(db, { ...base, requestId: r.id })).ok).toBe(true);
    expect((await answerEligibility(db, { ...base, requestId: r.id })).ok).toBe(false);
    expect(await declineEligibility(db, "demo", r2.id)).toBe(true);
    expect((await eligibilityRequests(db, { from: "UV-R-1000" })).map((x) => x.status).sort()).toEqual(["answered", "declined"]);
    expect(await eligibilityResult(db, "UV-R-2000", r.id)).toBeNull();
    expect(await eligibilityResult(db, "UV-R-1000", r.id)).not.toBeNull();
    expect((await answerEligibility(db, { ...base, requestId: r2.id })).ok).toBe(false); // declined
    expect((await answerEligibility(db, { ...base, requestId: "nope", authorised: [] })).ok).toBe(false);
  });
});
