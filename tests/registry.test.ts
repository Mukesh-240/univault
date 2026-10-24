/**
 * Tests for signing the simulated issuer's registry and storing it as database rows.
 * In plain words: a genuinely signed record still verifies after a round trip through the database
 * format; a record marked "rogue" (forged) is rejected; the database row holds no raw values.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAgainstIssuer } from "../src/lib/issuer";
import { fromRow, signEntries, toRow, type IssuerRecord } from "../src/lib/registry";

const k = generateKeyPairSync("ed25519");
const priv = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const pub = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");

const fields = { name: "Registry Test Person", cgpa: "7.25", serial: "RT-1" };
const base: IssuerRecord = { serial: "RT-1", doc_type: "degree_certificate", issuer_name: "Example Test University", fields, status: "active", superseded_by: null, version: 1, signer: "issuer" };

describe("registry signing", () => {
  const [good, forged] = signEntries([base, { ...base, version: 2, signer: "rogue" }], priv).map(toRow).map(fromRow);
  it("genuine entry survives the database round trip and verifies", () => {
    expect(verifyAgainstIssuer(fields, "digital", { reachable: true, entry: good }, pub).state).toBe("verified");
  });
  it("rogue-signed entry is rejected as untrusted", () => {
    expect(verifyAgainstIssuer(fields, "digital", { reachable: true, entry: forged }, pub)).toMatchObject({ state: "unverifiable", signatureValid: false });
  });
  it("database row stores fingerprints only, never the values", () => {
    const row = JSON.stringify(toRow(good));
    for (const v of Object.values(fields)) if (v !== "RT-1") expect(row).not.toContain(v);
  });
});
