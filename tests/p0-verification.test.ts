/**
 * PHASE 9 / P0.8 — VERIFICATION HONESTY. In plain words, these prove that:
 *   - the registry stores SALTED fingerprints: a small value such as a CGPA cannot be guessed from the registry alone
 *     (the old unsalted formula no longer matches), and two records with the same values get different fingerprints
 *     because every field has its own RANDOM salt;
 *   - values are written in one canonical form before hashing, so a re-typed copy with extra spaces, a different
 *     Unicode form or a day/month/year date does not raise a false alarm;
 *   - a salted record cannot be compared without the salts the issuer gave the holder (it says so, it does not guess);
 *   - a real difference names the exact field in neutral words;
 *   - a bad registry signature is rejected as untrusted, and old unsalted records still verify.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/lib/crypto";
import { canonValue, fieldHashes, issueEntry, newSalts, SALTED, verifyAgainstIssuer, type Fields } from "../src/lib/issuer";

const k = generateKeyPairSync("ed25519");
const PRIV = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const PUB = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const fields: Fields = { name: "Test Person", cgpa: "8.5", dob: "2001-03-04", serial: "T-1" };
const meta = { serial: "T-1", doc_type: "degree_certificate", issuer_name: "Example Issuer" };
const salts = newSalts(Object.keys(fields));
const entry = issueEntry(fields, meta, PRIV, salts);
const up = { reachable: true, entry };

describe("salted registry fingerprints", () => {
  it("are marked salted, and the old unsalted formula does not match them", () => {
    expect(entry.field_hashes[SALTED]).toBe("1");
    expect(entry.field_hashes.cgpa).not.toBe(sha256("cgpa=8.5"));
    for (const [key, v] of Object.entries(fields)) expect(Object.values(entry.field_hashes)).not.toContain(sha256(`${key}=${v}`));
  });
  it("differ between two records with identical values (random per-field salt)", () => {
    const other = issueEntry(fields, meta, PRIV, newSalts(Object.keys(fields)));
    expect(other.field_hashes.cgpa).not.toBe(entry.field_hashes.cgpa);
    expect(other.record_hash).not.toBe(entry.record_hash);
    expect(new Set(Object.values(salts)).size).toBe(Object.keys(salts).length); // no two fields share a salt
  });
  it("brute-forcing every plausible CGPA against the registry finds nothing without the salt", () => {
    const guesses = Array.from({ length: 1001 }, (_, i) => (i / 100).toFixed(2));
    const hit = guesses.some((g) => Object.values(entry.field_hashes).includes(sha256(`cgpa=${g}`)));
    expect(hit).toBe(false);
  });
});

describe("canonical form before hashing", () => {
  it("one form for spaces, Unicode and dates", () => {
    expect(canonValue("  Test   Person ")).toBe("Test Person");
    expect(canonValue("Café")).toBe(canonValue("Café"));
    expect(canonValue("4/3/2001")).toBe("2001-03-04");
    expect(canonValue("04-03-2001")).toBe("2001-03-04");
  });
  it("a harmless re-typing is still verified", () => {
    const copy = { ...fields, name: "  Test  Person ", dob: "04/03/2001" };
    expect(verifyAgainstIssuer(copy, "digital", up, PUB, new Date(), salts).state).toBe("verified");
  });
});

describe("honest outcomes", () => {
  it("a salted record without the salts is unverifiable, not a false mismatch", () => {
    const r = verifyAgainstIssuer(fields, "digital", up, PUB);
    expect(r.state).toBe("unverifiable");
    expect(r.mismatchedFields).toEqual([]);
  });
  it("a real difference names the field, in neutral words", () => {
    const r = verifyAgainstIssuer({ ...fields, cgpa: "9.5" }, "digital", up, PUB, new Date(), salts);
    expect(r.state).toBe("tamper_flagged");
    expect(r.mismatchedFields).toEqual(["cgpa"]);
    expect(r.reason).toMatch(/doesn't match the issuer's record in: cgpa/);
    expect(r.reason).toMatch(/scanning or typing mistake/);
    expect(r.reason).not.toMatch(/fake|forged|fraud|tamper/i);
  });
  it("a bad registry signature is rejected as untrusted", () => {
    const other = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    const r = verifyAgainstIssuer(fields, "digital", { reachable: true, entry: issueEntry(fields, meta, other, salts) }, PUB, new Date(), salts);
    expect(r).toMatchObject({ state: "unverifiable", signatureValid: false });
  });
  it("an old record made before salting still verifies the old way", () => {
    const legacy = issueEntry(fields, meta, PRIV);
    expect(legacy.field_hashes[SALTED]).toBeUndefined();
    expect(verifyAgainstIssuer(fields, "digital", { reachable: true, entry: legacy }, PUB).state).toBe("verified");
    expect(Object.keys(fieldHashes(fields))).toEqual(Object.keys(fields));
  });
});
