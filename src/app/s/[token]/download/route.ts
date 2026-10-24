/**
 * POST /s/<link>/download — a recipient's downloaded copy (only when the share allows downloads).
 *
 * It needs the signed pass from the page that was just opened (so the used one-time code isn't needed
 * again), and the link must still be alive. A view-only share NEVER serves a file: the attempt is
 * refused and logged. An allowed download is a small HTML file stamped with a STRONGER watermark than
 * the on-screen view (same session code), and its SHA-256 fingerprint is recorded in the access log and
 * the ledger — so a copy that turns up later can be matched to this download.
 */
import { cookies } from "next/headers";
import { sha256 } from "@/lib/crypto";
import { recipientView } from "@/lib/disclosure";
import { isLang, LANG_COOKIE, type Lang } from "@/lib/i18n";
import { deniedHtml, viewHtml } from "@/lib/recipient-html";
import { recipientLimit } from "@/lib/rate-limit";
import { log } from "@/lib/scrub";
import { loadDemoVault, serverKey } from "@/lib/server";
import { linkByTokenHash, logAccess } from "@/lib/share-store";
import { checkDownloadPass, decideDownload, hashDevice, hashToken, newDeviceId } from "@/lib/shares";
import { supabase } from "@/lib/supabase";
import { watermarkBackground, watermarkLabel } from "@/lib/watermark";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Downloaded copies carry a stronger watermark than the on-screen view (about 9%). */
const DOWNLOAD_WATERMARK_OPACITY = 0.18;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const jar = await cookies();
  const lc = jar.get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(lc) ? lc : "en";
  const deviceHash = hashDevice(jar.get("uv_dev")?.value ?? newDeviceId());
  const page = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  // Same per-address and per-link limits as the gate (rate-limit.ts): 429, nothing else happens.
  const limited = recipientLimit(req, hashToken(token));
  if (!limited.ok) return new Response(deniedHtml(lang, "rate_limited"), { status: 429, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": String(limited.retryAfterS) } });
  try {
    const form = await req.formData().catch(() => null);
    const tokenHash = hashToken(token);
    const found = token.length <= 100 ? await linkByTokenHash(supabase, tokenHash) : null;
    if (!found) return page(deniedHtml(lang, "denied:unknown_link"), 403);
    const now = new Date();
    const pass = checkDownloadPass(serverKey("VAULT_PRIVATE_KEY"), tokenHash, String(form?.get("pass") ?? "").slice(0, 200), now);
    const d = decideDownload(found.link, pass.ok, now);
    const base = { tokenId: found.tokenId, shareId: found.shareId, deviceHash };
    if (d.outcome !== "download") {
      await logAccess(supabase, { ...base, outcome: d.outcome, notify: d.notify });
      return page(deniedHtml(lang, d.outcome), 403);
    }
    const session = pass.session!;
    const time = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)} UTC`;
    const w = { name: found.recipientName, recipientCode: found.link.recipientCode, time, session };
    const view = recipientView(await loadDemoVault(now), found.fields);
    const file = viewHtml({ lang, recipientName: found.recipientName, purpose: found.purpose, fields: view.fields, attestations: view.attestations,
      statement: view.statement, verified: found.snapshot.docs.map((x) => ({ title: x.title, state: x.state })), expiresAt: found.link.expiresAt,
      watermark: watermarkLabel(w), session }, watermarkBackground(w, DOWNLOAD_WATERMARK_OPACITY));
    const fingerprint = sha256(file);
    await logAccess(supabase, { ...base, outcome: "download", notify: null, session, fingerprint });
    return new Response(file, { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `attachment; filename="univault-share-${session}.html"`, "cache-control": "no-store" } });
  } catch (e) {
    log("error", "recipient download failed", { message: e instanceof Error ? e.message : "unknown" });
    return page(deniedHtml(lang, "error"), 500);
  }
}
