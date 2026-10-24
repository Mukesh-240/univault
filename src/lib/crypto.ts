/**
 * CRYPTO — fingerprints, signatures and random codes. Runs on the server only.
 *
 * Plain-English glossary:
 *   - Fingerprint (SHA-256 hash): a 64-character code computed from some content. Change even one
 *     character of the content and the fingerprint changes completely. Used to detect tampering.
 *   - Signature (Ed25519): proof that a message came from whoever holds a secret "private key".
 *     Anyone with the matching "public key" can check it, but cannot forge it.
 *   - Token: a long random code used in a share link (256 bits = practically unguessable).
 *   - OTP: a 6-digit one-time code (simulated in this prototype; shown on screen, never sent by SMS).
 * All of this is standard, real cryptography from Node.js — not simulated.
 */
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from "node:crypto";

/** Fingerprint of a text or file, as 64 hexadecimal characters. */
export const sha256 = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");

/** Deterministic JSON: keys sorted, so identical content always hashes identically. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object")
    return "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(v);
}

// Keys are stored in .env.local as base64 text; these turn that text back into usable key objects.
const priv = (b64: string) => createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
const pub = (b64: string) => createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });

/** Sign a text with a private key; returns the signature as base64 text. */
export const signText =(text: string, privB64: string): string => sign(null, Buffer.from(text), priv(privB64)).toString("base64");
/** Check a signature with a public key. Any problem (missing, garbled, wrong key) simply means "not valid". */
export const verifyText =(text: string, sigB64: string | null | undefined, pubB64: string): boolean => {
  if (!sigB64) return false;
  try { return verify(null, Buffer.from(text), pub(pubB64), Buffer.from(sigB64, "base64")); } catch { return false; }
};

/** A random share-link token (32 bytes = 256 bits), written with URL-safe characters. */
export const randomToken =(bytes = 32): string => randomBytes(bytes).toString("base64url");
/** A random 6-digit one-time code (100000 to 999999). */
export const randomOtp =(): string => String(100000 + (randomBytes(4).readUInt32BE() % 900000));
