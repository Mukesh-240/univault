/**
 * SESSION — the "you are signed in" cookie, and the short-lived "sign-in in progress" cookie.
 *
 * Plain-English picture:
 *   After the simulated sign-in the server hands the browser a cookie. The cookie is HttpOnly (page
 *   scripts cannot read it) and SameSite=Lax. Its content is signed with the server's existing secret
 *   (VAULT_PRIVATE_KEY) using HMAC-SHA256, so nobody can make or change one without that secret. No new
 *   secret and no database table are needed: the cookie itself says who it is for and until when.
 *
 *   What a cookie holds:
 *     - session   : the LAST FOUR digits of the demo number (never the full number), the person's name
 *                   from the vault record (for the greeting), when it was made and when it ends;
 *     - challenge : a sign-in in progress. It holds keyed fingerprints of the number and of the code
 *                   (not the values), the last four digits, and which step is done.
 *   Works in the edge middleware and on the Node server alike (only the Web Crypto API is used).
 */

export const SESSION_COOKIE = "uv_session";
export const CHALLENGE_COOKIE = "uv_chal";
/** A signed-in browser stays signed in this long (no surprise log-outs mid-task; "Sign out" ends it at once). */
export const SESSION_DAYS = 7;
/** A one-time sign-in code, and the sign-in step it belongs to, last this long. */
export const CODE_TTL_SECONDS = 10 * 60;

/** Who is signed in: an issuer (an organisation that issues documents), a sender (a person who keeps and shares documents), or a receiver (an organisation or person who is sent documents). */
export type Role = "issuer" | "sender" | "receiver";
export const ROLES: Role[] = ["issuer", "sender", "receiver"];
export const isRole = (v: unknown): v is Role => v === "issuer" || v === "sender" || v === "receiver";

/** `ref` says which one: the issuer's name, the holder's vault owner id, or the receiver's recipient code. */
export interface SessionPayload { kind: "session"; last4: string; name: string | null; role?: Role; ref?: string; iat: number; exp: number }
export interface ChallengePayload { kind: "challenge"; stage: "code" | "verified"; nm: string; cm: string; last4: string; role?: Role; ref?: string; name?: string; exp: number }

const enc = new TextEncoder();

const toB64Url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const hmacKey = (secret: string, usages: KeyUsage[]) => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);

/** Sign a small JSON object: `<payload>.<signature>`, both URL-safe base64. */
export async function seal(payload: SessionPayload | ChallengePayload, secret: string): Promise<string> {
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), enc.encode(body)));
  return `${body}.${toB64Url(sig)}`;
}

/** Check the signature (in constant time) and the end time; null for anything forged, damaged or expired. */
export async function open<T extends SessionPayload | ChallengePayload>(token: string | undefined, kind: T["kind"], secret: string, nowMs = Date.now()): Promise<T | null> {
  if (!token || token.length > 2000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, ["verify"]), fromB64Url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64Url(body))) as T;
    return p.kind === kind && typeof p.exp === "number" && p.exp * 1000 > nowMs ? p : null;
  } catch {
    return null;
  }
}

/** A keyed fingerprint (HMAC-SHA256, hex) of a value: used to bind a number or a code to a sign-in without keeping it. */
export async function fingerprint(secret: string, label: string, value: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), enc.encode(`${label}|${value}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compare two strings without stopping at the first difference. */
export function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Was this request made over https (directly, or behind Vercel's proxy)? Then the cookies get `Secure`. */
export function isSecure(req: Request): boolean {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

/** Cookie attributes shared by both cookies: HttpOnly, SameSite=Lax, and Secure whenever the page is https. */
export function cookieOptions(maxAgeSeconds: number, secure: boolean): { httpOnly: true; sameSite: "lax"; path: "/"; maxAge: number; secure: boolean } {
  return { httpOnly: true, sameSite: "lax", path: "/", maxAge: maxAgeSeconds, secure };
}
