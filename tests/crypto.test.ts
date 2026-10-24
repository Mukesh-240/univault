import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canon, randomOtp, randomToken, sha256, signText, verifyText } from "../src/lib/crypto";

const k = generateKeyPairSync("ed25519");
const priv = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const pub = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");

describe("crypto", () => {
  it("sha256 known vector", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("canon is key-order independent and nested", () => {
    expect(canon({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(canon({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
    expect(canon({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it("sign / verify round trip, and rejects tampering", () => {
    const sig = signText("hello", priv);
    expect(verifyText("hello", sig, pub)).toBe(true);
    expect(verifyText("hellO", sig, pub)).toBe(false);
    expect(verifyText("hello", null, pub)).toBe(false);
    expect(verifyText("hello", "not-base64!!", pub)).toBe(false);
    expect(verifyText("hello", sig, "garbage")).toBe(false);
  });
  it("token is 256-bit base64url and OTP is 6 digits", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
    for (let i = 0; i < 50; i++) expect(randomOtp()).toMatch(/^\d{6}$/);
  });
});
