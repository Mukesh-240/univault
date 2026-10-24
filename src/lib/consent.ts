/**
 * CONSENT — proof that a person really clicked "Confirm" on the exact share they previewed.
 *
 * Plain-English picture:
 *   Nothing (no document text, no assistant, no other code) may create a share by itself.
 *   When the person opens the share PREVIEW, the server issues a short-lived "preview token":
 *   a signed fingerprint of exactly what will be shared (recipient, purpose, fields, expiry, policy).
 *   The share can only be created if the confirm click sends back that token AND the share being
 *   created still matches the preview exactly. Change one field after previewing -> rejected.
 *   Tokens expire after 10 minutes. They are never stored; only checked.
 */
import { z } from "zod";
import { canon, sha256, signText, verifyText } from "./crypto";

/** Longest a share may last (spec: retention default, shares max 30 days). */
export const MAX_SHARE_DAYS = 30;

/** What a share consists of (the part the person previews and confirms), checked at the API boundary. */
export const ShareDraftSchema = z.object({
  recipient_code: z.string().regex(/^UV-R-\d{3,6}$/),
  purpose: z.string().min(1).max(60),
  fields: z.array(z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/)).min(1).max(40),
  expires_at: z.string().datetime(),
  policy: z.object({ mode: z.enum(["view_only", "download"]), max_views: z.number().int().min(1).max(100).optional() }),
});
export type ShareDraft = z.infer<typeof ShareDraftSchema>;

export const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;

const b64url = (s: string) => Buffer.from(s).toString("base64url");
/** Field order doesn't change the meaning of a share, so sort before fingerprinting. */
const draftHash = (d: ShareDraft) => sha256(canon({ ...d, fields: [...d.fields].sort() }));

/** Issue a preview token for exactly this draft (server-side, signed with the vault key). */
export function previewToken(draft: ShareDraft, vaultPrivB64: string, now: Date, ttlMs = PREVIEW_TOKEN_TTL_MS): string {
  const body = b64url(JSON.stringify({ h: draftHash(draft), exp: now.getTime() + ttlMs }));
  return `${body}.${signText(body, vaultPrivB64)}`;
}

/** Check a confirmation: right signature, not expired, and the draft is exactly what was previewed. */
export function checkConfirmation(draft: ShareDraft, token: string | null | undefined, vaultPubB64: string, now: Date): { ok: true } | { ok: false; reason: string } {
  if (!token) return { ok: false, reason: "No confirmation: a share needs your explicit confirmation after the preview." };
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifyText(body, sig, vaultPubB64)) return { ok: false, reason: "The confirmation is not valid." };
  let parsed: { h?: string; exp?: number };
  try { parsed = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return { ok: false, reason: "The confirmation is not valid." }; }
  if (typeof parsed.exp !== "number" || parsed.exp < now.getTime()) return { ok: false, reason: "The preview expired. Please preview the share again." };
  if (parsed.h !== draftHash(draft)) return { ok: false, reason: "The share changed after you previewed it. Please preview it again." };
  return { ok: true };
}
