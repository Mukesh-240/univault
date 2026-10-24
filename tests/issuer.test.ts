import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueEntry, verifyAgainstIssuer, type Fields } from "../src/lib/issuer";

const mk = () => {
  const k = generateKeyPairSync("ed25519");
  return {
    priv: k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    pub: k.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
};
const issuer = mk(), rogue = mk();
const fields: Fields = { name: "Test Person", serial: "T-1", cgpa: "8.41", year: "2025" };
const meta = { serial: "T-1", doc_type: "degree_certificate", issuer_name: "Example Test University" };
const entry = issueEntry(fields, meta, issuer.priv);
const up = { reachable: true, entry };

describe("verifyAgainstIssuer", () => {
  it("exact digital original verifies by hash", () => {
    const r = verifyAgainstIssuer({ ...fields }, "digital", up, issuer.pub);
    expect(r).toMatchObject({ state: "verified", method: "hash", signatureValid: true, registryVersion: 1 });
  });
  it("one altered digit names exactly that field, neutral wording", () => {
    const r = verifyAgainstIssuer({ ...fields, cgpa: "8.47" }, "digital", up, issuer.pub);
    expect(r.state).toBe("tamper_flagged");
    expect(r.mismatchedFields).toEqual(["cgpa"]);
    expect(r.reason).toMatch(/doesn't match the issuer's record/);
    expect(r.reason).toMatch(/scanning or typing mistake/);
    expect(r.reason).not.toMatch(/forg|fraud|fake|tamper/i);
  });
  it("missing and extra fields are both named", () => {
    const { year: _y, ...missing } = fields;
    expect(verifyAgainstIssuer(missing, "digital", up, issuer.pub).mismatchedFields).toEqual(["year"]);
    expect(verifyAgainstIssuer({ ...fields, note: "x" }, "digital", up, issuer.pub).mismatchedFields).toEqual(["note"]);
  });
  it("digital copy that only differs in spacing is not called a mismatch on any field", () => {
    const r = verifyAgainstIssuer({ ...fields, name: "Test Person " }, "digital", up, issuer.pub);
    expect(r.mismatchedFields).toEqual([]);
    expect(r.state).toBe("verified");
    expect(r.method).toBe("fields");
  });
  it("confirmed scan with equal fields verifies by fields (labelled weaker)", () => {
    const r = verifyAgainstIssuer({ ...fields }, "scan", up, issuer.pub);
    expect(r).toMatchObject({ state: "verified", method: "fields" });
    expect(r.reason).toMatch(/weaker evidence/);
  });
  it("registry reply signed by another key is rejected", () => {
    const forged = issueEntry(fields, meta, rogue.priv);
    const r = verifyAgainstIssuer(fields, "digital", { reachable: true, entry: forged }, issuer.pub);
    expect(r).toMatchObject({ state: "unverifiable", signatureValid: false });
  });
  it("a valid entry edited after signing is rejected", () => {
    const edited = { ...entry, status: "active" as const, record_hash: "0".repeat(64) };
    expect(verifyAgainstIssuer(fields, "digital", { reachable: true, entry: edited }, issuer.pub).signatureValid).toBe(false);
  });
  it("revoked and superseded states", () => {
    const rev = issueEntry(fields, { ...meta, status: "revoked" }, issuer.priv);
    const sup = issueEntry(fields, { ...meta, status: "superseded", superseded_by: "T-2" }, issuer.priv);
    expect(verifyAgainstIssuer(fields, "digital", { reachable: true, entry: rev }, issuer.pub).state).toBe("revoked");
    const s = verifyAgainstIssuer(fields, "digital", { reachable: true, entry: sup }, issuer.pub);
    expect(s.state).toBe("superseded");
    expect(s.reason).toMatch(/T-2/);
  });
  it("unreachable issuer gives a timestamped unverifiable label", () => {
    const r = verifyAgainstIssuer(fields, "digital", { reachable: false }, issuer.pub, new Date("2026-10-25T09:07:00Z"));
    expect(r.state).toBe("unverifiable");
    expect(r.reason).toBe("Unverified: issuer unreachable at 09:07 UTC, retrying.");
  });
  it("unknown serial is unverifiable", () => {
    expect(verifyAgainstIssuer(fields, "digital", { reachable: true, entry: null }, issuer.pub).state).toBe("unverifiable");
  });
});
