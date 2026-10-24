/**
 * /s/<link> — the recipient's door. Plain HTML forms, no JavaScript.
 *
 * GET  -> if the link is dead (unknown, killed, revoked, expired) say so and log the attempt;
 *         otherwise show the gate (step 1: recipient ID).
 * POST step "send" -> right ID on a live link: a fresh one-time code is created, only its fingerprint is
 *         logged, and the code is shown on screen (SIMULATED delivery). Wrong ID: denied, logged, owner told.
 * POST step "open" -> the code is checked (newest, unused, under 10 minutes). Allowed: the minimal view
 *         with the diagonal watermark (recipient · code · time · session). Every attempt writes access_log
 *         AND a ledger line (share-store.logAccess).
 * The raw token in the address is only ever fingerprinted; it is never stored or logged. A small random
 * cookie identifies the visitor's browser so a SECOND device can be noticed; only its fingerprint is logged.
 * SLOW DOWN: every request first passes the per-address and per-link limits (rate-limit.ts; 429 past
 * them, nothing else happens). Five wrong codes in a row lock the link for 15 minutes (429, owner told);
 * the lock is a row in the access log, so every server instance sees it.
 */
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { recipientView } from "@/lib/disclosure";
import { isLang, LANG_COOKIE, preferredLang, translate, type Lang } from "@/lib/i18n";
import { deniedHtml, gateHtml, viewHtml } from "@/lib/recipient-html";
import { recipientLimit } from "@/lib/rate-limit";
import { log } from "@/lib/scrub";
import { loadDemoVault, serverKey } from "@/lib/server";
import { linkByTokenHash, logAccess, markExpired } from "@/lib/share-store";
import {
  decideCodeRequest, decideOpen, downloadPass, hashCode, hashDevice, hashToken, linkStatus, LOCK_MS, lockedUntil, MAX_WRONG_CODES, newDeviceId, newOneTimeCode,
  newSessionCode, wrongCodesSinceReset,
} from "@/lib/shares";
import { supabase } from "@/lib/supabase";
import { watermarkBackground, watermarkLabel } from "@/lib/watermark";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEVICE_COOKIE = "uv_dev";
const MAX_TOKEN_LENGTH = 100;

/** Language, and this browser's device id (created on first visit). */
async function visitor() {
  const jar = await cookies();
  const c = jar.get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(c) ? c : preferredLang((await headers()).get("accept-language"));
  const existing = jar.get(DEVICE_COOKIE)?.value;
  const device = existing && existing.length <= 64 ? existing : newDeviceId();
  return { lang, device, isNew: device !== existing };
}

function html(body: string, status: number, device: { id: string; isNew: boolean }, retryAfterS?: number) {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
  if (retryAfterS) headers.set("retry-after", String(retryAfterS));
  if (device.isNew) headers.append("set-cookie", `${DEVICE_COOKIE}=${device.id}; Path=/s; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  return new Response(body, { status, headers });
}

/** The gate form: which step, the recipient ID (UV-R-…) and the one-time code. Anything else is refused. */
const GateForm = z.object({
  step: z.enum(["send", "open"]).default("send"),
  recipient_id: z.string().trim().max(40).default(""),
  code: z.string().trim().max(20).default(""),
});

/** 429 "too many attempts": the plain page, plus Retry-After so a browser or script knows how long to wait. */
const tooMany = (lang: Lang, dev: { id: string; isNew: boolean }, retryAfterS: number) => html(deniedHtml(lang, "rate_limited"), 429, dev, retryAfterS);
/** 429 "locked": the link is locked after too many wrong codes, until `until`. */
const lockedPage = (lang: Lang, dev: { id: string; isNew: boolean }, until: string, now: Date) =>
  html(deniedHtml(lang, "denied:locked"), 429, dev, Math.max(1, Math.ceil((Date.parse(until) - now.getTime()) / 1000)));

const lookup = (token: string) => (token.length <= MAX_TOKEN_LENGTH ? linkByTokenHash(supabase, hashToken(token)) : Promise.resolve(null));

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await visitor();
  const dev = { id: v.device, isNew: v.isNew };
  const limited = recipientLimit(_req, hashToken(token));
  if (!limited.ok) return tooMany(v.lang, dev, limited.retryAfterS);
  try {
    const found = await lookup(token);
    const now = new Date();
    const status = linkStatus(found?.link ?? null, now);
    if (status !== "active") {
      if (found) {
        if (status === "denied:expired" && !found.expiredLogged) await markExpired(supabase, found.shareId, found.tokenId);
        const notify = status === "denied:revoked" ? "revoked_link_attempt" : status === "denied:killed" ? "killed_link_attempt" : "expired_link_attempt";
        await logAccess(supabase, { tokenId: found.tokenId, shareId: found.shareId, outcome: status, deviceHash: hashDevice(v.device), notify });
      }
      return html(deniedHtml(v.lang, status), 403, dev);
    }
    const until = lockedUntil(found!.past, now);
    if (until) {
      await logAccess(supabase, { tokenId: found!.tokenId, shareId: found!.shareId, outcome: "denied:locked", deviceHash: hashDevice(v.device), notify: null });
      return lockedPage(v.lang, dev, until, now);
    }
    return html(gateHtml(v.lang, `/s/${token}`), 200, dev);
  } catch (e) {
    log("error", "recipient gate failed", { message: e instanceof Error ? e.message : "unknown" });
    return html(deniedHtml(v.lang, "error"), 500, dev);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await visitor();
  const dev = { id: v.device, isNew: v.isNew };
  const action = `/s/${token}`;
  const limited = recipientLimit(req, hashToken(token));
  if (!limited.ok) return tooMany(v.lang, dev, limited.retryAfterS);
  try {
    const form = await req.formData().catch(() => null);
    const parsed = GateForm.safeParse(form ? Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) : {});
    if (!parsed.success) return html(gateHtml(v.lang, action, { error: translate(v.lang, "gate.wrong") }), 400, dev);
    const { step, recipient_id: recipientId, code } = parsed.data;
    const found = await lookup(token);
    if (!found) return html(deniedHtml(v.lang, "denied:unknown_link"), 403, dev);
    const now = new Date();
    const deviceHash = hashDevice(v.device);
    const base = { tokenId: found.tokenId, shareId: found.shareId, deviceHash };
    // Locked after too many wrong codes: nothing else is checked, not even a correct code.
    const until = lockedUntil(found.past, now);
    if (until) { await logAccess(supabase, { ...base, outcome: "denied:locked", notify: null }); return lockedPage(v.lang, dev, until, now); }
    const refuse = async (outcome: string) => {
      if (outcome === "denied:expired" && !found.expiredLogged) await markExpired(supabase, found.shareId, found.tokenId);
      const wrongDetails = outcome === "denied:wrong_recipient" || outcome === "denied:wrong_code" || outcome === "denied:otp_reused";
      return html(wrongDetails ? gateHtml(v.lang, action, { error: translate(v.lang, "gate.wrong") }) : deniedHtml(v.lang, outcome), 403, dev);
    };

    if (step === "send") {
      const d = decideCodeRequest(found.link, { recipientId, deviceHash, now });
      if (d.outcome !== "code_issued") { await logAccess(supabase, { ...base, outcome: d.outcome, notify: d.notify }); return refuse(d.outcome); }
      const code = newOneTimeCode();
      await logAccess(supabase, { ...base, outcome: "code_issued", notify: null, codeHash: hashCode(code) });
      return html(gateHtml(v.lang, action, { recipientId, sentCode: code }), 200, dev);
    }

    const d = decideOpen(found.link, { recipientId, code, deviceHash, now }, found.past);
    if (d.outcome !== "allowed") {
      await logAccess(supabase, { ...base, outcome: d.outcome, notify: d.notify });
      // That was the 5th wrong code in a row: lock the link for 15 minutes and tell the owner.
      if (wrongCodesSinceReset([...found.past, { outcome: d.outcome, deviceHash }]) >= MAX_WRONG_CODES) {
        await logAccess(supabase, { ...base, outcome: "locked", notify: "share_locked" });
        return lockedPage(v.lang, dev, new Date(now.getTime() + LOCK_MS).toISOString(), now);
      }
      return refuse(d.outcome);
    }
    const session = newSessionCode();
    await logAccess(supabase, { ...base, outcome: "allowed", notify: d.notify, session, codeHash: hashCode(code) });
    const time = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)} UTC`;
    const w = { name: found.recipientName, recipientCode: found.link.recipientCode, time, session };
    const view = recipientView(await loadDemoVault(now), found.fields);
    return html(viewHtml({
      lang: v.lang, recipientName: found.recipientName, purpose: found.purpose, fields: view.fields, attestations: view.attestations,
      statement: view.statement, verified: found.snapshot.docs.map((x) => ({ title: x.title, state: x.state })), expiresAt: found.link.expiresAt,
      watermark: watermarkLabel(w), session,
      download: found.link.policy === "download" ? { action: `/s/${token}/download`, pass: downloadPass(serverKey("VAULT_PRIVATE_KEY"), hashToken(token), session, now) } : undefined,
    }, watermarkBackground(w)), 200, dev);
  } catch (e) {
    log("error", "recipient open failed", { message: e instanceof Error ? e.message : "unknown" });
    return html(deniedHtml(v.lang, "error"), 500, dev);
  }
}
