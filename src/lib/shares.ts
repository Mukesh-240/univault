/**
 * SHARES — the rules of per-person sharing, as pure functions (no database in this file).
 *
 * Plain-English picture:
 *   A share sends a chosen, minimal set of facts to ONE recipient for ONE purpose until an expiry date.
 *   Each recipient gets their own secret link (a 256-bit token). The link alone is not enough:
 *     1. the visitor types the approved recipient ID (like UV-R-1042) and asks for a one-time code;
 *     2. a fresh 6-digit code is "sent" — in this prototype it is shown on screen, labelled SIMULATED
 *        (no real SMS/email); it works ONCE and for 10 minutes;
 *     3. the visitor types the code and sees the minimal, watermarked view.
 *   Only fingerprints (SHA-256) of the token and of each code are stored, never the raw values.
 *
 *   This file decides, for any attempt:
 *     - allowed, or denied and why (unknown link, revoked, killed, expired, view limit used up, wrong ID,
 *       wrong code, code already used, view-only download);
 *     - whether the owner should be notified: first open, a NEW device, an attempt on a revoked / killed /
 *       expired link, a wrong ID or a wrong/reused code — but not every ordinary view (avoids noise).
 *   It also turns the text read off a leaked screenshot's watermark into who/which session it was.
 *   The routes, the evaluation harness and the tests all use these same functions.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { sha256 } from "./crypto";
import { parseWatermark } from "./watermark";

// ─────────────────────────── States (spec §3) ───────────────────────────

export type ShareState = "drafted" | "previewed" | "confirmed" | "active" | "revoked" | "expired";
export type TokenState = "issued" | "active" | "killed" | "expired";

/** The legal next states. Anything else is refused. */
export const SHARE_TRANSITIONS: Record<ShareState, ShareState[]> = {
  drafted: ["previewed"], previewed: ["confirmed"], confirmed: ["active"], active: ["revoked", "expired"], revoked: [], expired: [],
};
export const canMove = (from: ShareState, to: ShareState) => SHARE_TRANSITIONS[from].includes(to);

/** Verification states that stop a share: the person must look at the problem first. */
export const BLOCKING_STATES = ["tamper_flagged", "superseded", "revoked"];

/** Longest a share may last (spec retention default) — the same limit consent.ts enforces. */
export const MAX_SHARE_DAYS = 30;
/** Is this expiry acceptable when the share is created? Only a date already in the past is refused
 *  (a share expiring at this very moment is created and is simply already closed to visitors). */
export function checkExpiry(expiresAt: string, now: Date): { ok: true } | { ok: false; reason: "expiry_in_past" | "expiry_too_far" } {
  const days = (Date.parse(expiresAt) - now.getTime()) / 86_400_000;
  if (!(days >= 0)) return { ok: false, reason: "expiry_in_past" };
  if (days > MAX_SHARE_DAYS) return { ok: false, reason: "expiry_too_far" };
  return { ok: true };
}

// ─────────────────────────── Secrets ───────────────────────────

export const hashToken = (token: string) => sha256(`token|${token}`);
export const hashCode = (code: string) => sha256(`code|${code.trim()}`);
export const hashDevice = (deviceId: string) => sha256(`device|${deviceId}`);
export const hashIdempotencyKey = (key: string) => sha256(`idem|${key}`);

/**
 * The link token (256 bits) for one share, derived from the server's secret key and the request's
 * idempotency key with HMAC-SHA256: unpredictable without the server key, and the SAME on a retry of the
 * same request — so a dropped connection can't create a second share, and the retry can still show the
 * receipt. The raw token is never stored.
 */
export function shareToken(serverSecretB64: string, idempotencyKey: string): { token: string; tokenHash: string } {
  const token = createHmac("sha256", Buffer.from(serverSecretB64, "base64")).update(`share-token|${idempotencyKey}`).digest().toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** A fresh random 6-digit one-time code. */
export const newOneTimeCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
/** How long a one-time code works after it is sent. */
export const CODE_TTL_MS = 10 * 60 * 1000;

const SESSION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I: easy to read off a screenshot
export const SESSION_LENGTH = 6;
/** A fresh session code for one opening of a link (printed in the watermark). */
export const newSessionCode = () => Array.from(randomBytes(SESSION_LENGTH), (b) => SESSION_ALPHABET[b % SESSION_ALPHABET.length]).join("");
/** A random id for a visitor's browser (kept in a cookie; only its fingerprint is logged). */
export const newDeviceId = () => randomBytes(16).toString("base64url");

/** How long the download button on an opened page keeps working. */
export const DOWNLOAD_PASS_TTL_MS = 15 * 60 * 1000;
/** A signed pass that lets the page just opened request its download (so the used code isn't needed again). */
export function downloadPass(serverSecretB64: string, tokenHash: string, session: string, now: Date): string {
  const exp = now.getTime() + DOWNLOAD_PASS_TTL_MS;
  const sig = createHmac("sha256", Buffer.from(serverSecretB64, "base64")).update(`dl|${tokenHash}|${session}|${exp}`).digest("base64url");
  return `${session}.${exp}.${sig}`;
}
export function checkDownloadPass(serverSecretB64: string, tokenHash: string, pass: string, now: Date): { ok: boolean; session?: string } {
  const [session, exp, sig] = pass.split(".");
  if (!session || !exp || !sig || Number(exp) < now.getTime()) return { ok: false };
  const want = createHmac("sha256", Buffer.from(serverSecretB64, "base64")).update(`dl|${tokenHash}|${session}|${exp}`).digest();
  const got = Buffer.from(sig, "base64url");
  return got.length === want.length && timingSafeEqual(got, want) ? { ok: true, session } : { ok: false };
}

// ─────────────────────────── Access decisions ───────────────────────────

export type Outcome = "allowed" | "code_issued" | "download" | "locked"
  | "denied:unknown_link" | "denied:revoked" | "denied:killed" | "denied:expired" | "denied:max_views"
  | "denied:wrong_recipient" | "denied:unintended_account" | "denied:wrong_code" | "denied:otp_reused" | "denied:view_only" | "denied:locked";
export type NotifyKind = "first_open" | "new_device" | "wrong_recipient_attempt" | "wrong_code_attempt"
  | "killed_link_attempt" | "unintended_account" | "revoked_link_attempt" | "expired_link_attempt" | "share_locked";

/** What the database knows about one link. */
export interface LinkFacts { shareRevoked: boolean; tokenKilled: boolean; expiresAt: string; maxViews?: number; recipientCode: string; policy: "view_only" | "download" }
/** An earlier event on the same link (from access_log). `codeHash` is set on code_issued and allowed rows. */
export interface PastAccess { outcome: string; deviceHash: string | null; codeHash?: string | null; at?: string }
export interface Attempt { recipientId: string; deviceHash: string; now: Date }

type LinkStatus = "active" | "denied:unknown_link" | "denied:revoked" | "denied:killed" | "denied:expired";
const DEAD_NOTIFY: Record<Exclude<LinkStatus, "active" | "denied:unknown_link">, NotifyKind> = {
  "denied:revoked": "revoked_link_attempt", "denied:killed": "killed_link_attempt", "denied:expired": "expired_link_attempt",
};

/** Is the link itself still alive (before looking at who is knocking)? */
export function linkStatus(link: LinkFacts | null, now: Date): LinkStatus {
  if (!link) return "denied:unknown_link";
  if (link.shareRevoked) return "denied:revoked";
  if (link.tokenKilled) return "denied:killed";
  if (Date.parse(link.expiresAt) <= now.getTime()) return "denied:expired";
  return "active";
}

export interface Decision { outcome: Outcome; notify: NotifyKind | null }

/** Checks shared by both steps: the link is alive and the recipient ID is the approved one. */
function gateCheck(link: LinkFacts | null, a: Attempt): Decision | null {
  const status = linkStatus(link, a.now);
  if (status === "denied:unknown_link") return { outcome: status, notify: null }; // no owner to tell
  if (status !== "active") return { outcome: status, notify: DEAD_NOTIFY[status] };
  if (a.recipientId.trim().toUpperCase() !== link!.recipientCode.toUpperCase()) return { outcome: "denied:wrong_recipient", notify: "wrong_recipient_attempt" };
  return null;
}

/** Step 1: the visitor asks for a one-time code. Issued only for a live link and the approved recipient ID. */
export function decideCodeRequest(link: LinkFacts | null, a: Attempt): Decision {
  return gateCheck(link, a) ?? { outcome: "code_issued", notify: null };
}

/** Step 2: the visitor enters the code. The newest unused code sent in the last 10 minutes works, once. */
export function decideOpen(link: LinkFacts | null, a: Attempt & { code: string }, past: PastAccess[]): Decision {
  const denied = gateCheck(link, a);
  if (denied) return denied;
  const h = hashCode(a.code);
  const used = new Set(past.filter((p) => p.outcome === "allowed" && p.codeHash).map((p) => p.codeHash));
  if (used.has(h)) return { outcome: "denied:otp_reused", notify: "wrong_code_attempt" };
  const latest = [...past].reverse().find((p) => p.outcome === "code_issued");
  const fresh = latest && latest.codeHash === h && !used.has(h) && (!latest.at || a.now.getTime() - Date.parse(latest.at) <= CODE_TTL_MS);
  if (!fresh) return { outcome: "denied:wrong_code", notify: "wrong_code_attempt" };
  const opened = past.filter((p) => p.outcome === "allowed");
  if (link!.maxViews !== undefined && opened.length >= link!.maxViews) return { outcome: "denied:max_views", notify: null };
  if (!opened.length) return { outcome: "allowed", notify: "first_open" };
  return { outcome: "allowed", notify: opened.some((p) => p.deviceHash === a.deviceHash) ? null : "new_device" };
}

// ─────────────────────────── Lock after wrong codes ───────────────────────────
//
// Five wrong (or reused) one-time codes in a row lock the link for 15 minutes: nobody can ask for a
// code or open it, even with the right one, and the owner is told. The lock is a "locked" row in the
// access log, so it is the same on every server instance and survives restarts. A successful open or
// a lock starts the count again from zero.

export const MAX_WRONG_CODES = 5;
export const LOCK_MS = 15 * 60 * 1000;
const WRONG_CODE_OUTCOMES = ["denied:wrong_code", "denied:otp_reused"];

/** Wrong codes since the last successful open or the last lock (attempts in oldest-first order). */
export function wrongCodesSinceReset(past: PastAccess[]): number {
  let n = 0;
  for (const p of past) {
    if (p.outcome === "allowed" || p.outcome === "locked") n = 0;
    else if (WRONG_CODE_OUTCOMES.includes(p.outcome)) n++;
  }
  return n;
}

/** If the link is locked right now, until when (ISO time); otherwise null. */
export function lockedUntil(past: PastAccess[], now: Date): string | null {
  const lock = [...past].reverse().find((p) => p.outcome === "locked");
  if (!lock?.at) return null;
  const until = Date.parse(lock.at) + LOCK_MS;
  return until > now.getTime() ? new Date(until).toISOString() : null;
}

/** A download from a page that was just opened (its pass already checked). View-only shares never serve a file. */
export function decideDownload(link: LinkFacts | null, passOk: boolean, now: Date): Decision {
  const status = linkStatus(link, now);
  if (status === "denied:unknown_link") return { outcome: status, notify: null };
  if (status !== "active") return { outcome: status, notify: DEAD_NOTIFY[status] };
  if (!passOk) return { outcome: "denied:wrong_code", notify: "wrong_code_attempt" };
  if (link!.policy !== "download") return { outcome: "denied:view_only", notify: null };
  return { outcome: "download", notify: null };
}

// ─────────────────────────── Leak trace ───────────────────────────

/** One logged opening that a watermark could point back to. */
export interface TraceRow { session: string | null; recipientCode: string }

/**
 * Text read off a leaked screenshot -> the logged openings it matches. The watermark carries the
 * recipient code and the session code; either is enough to search, both together pin one opening.
 */
export function matchLeak<T extends TraceRow>(text: string, rows: T[]): { parsed: { recipientCode?: string; session?: string }; matches: T[] } {
  const parsed = parseWatermark(text);
  if (!parsed.session && !parsed.recipientCode) return { parsed, matches: [] };
  const matches = rows.filter((r) => (!parsed.session || r.session === parsed.session) && (!parsed.recipientCode || r.recipientCode === parsed.recipientCode));
  return { parsed, matches };
}
