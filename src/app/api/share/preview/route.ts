/**
 * POST /api/share/preview — show exactly what a share would reveal, before anything is shared.
 * Body: { "recipient_code", "purpose", "fields": [...], "expires_at": "<ISO>", "policy": { "mode", "max_views"? } }
 *
 * It (1) checks the recipient exists, (2) flags an over-broad request and suggests the minimal set,
 * (3) RE-VERIFIES every document the items come from (verification runs just before any share),
 * (4) builds the exact recipient view, and (5) issues the preview token. /api/share/confirm refuses
 * anything without that token, and refuses a draft that changed after previewing.
 * The token goes to the person's browser only and is never stored.
 */
import { NextResponse } from "next/server";
import { previewToken, ShareDraftSchema } from "@/lib/consent";
import { append } from "@/lib/ledger";
import { checkRequest } from "@/lib/overbroad";
import { loadPacks } from "@/lib/rules";
import { log } from "@/lib/scrub";
import { badRequest, serverError, serverKey } from "@/lib/server";
import { reverifyAndView } from "@/lib/share-store";
import { checkExpiry, MAX_SHARE_DAYS } from "@/lib/shares";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = ShareDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const draft = parsed.data;
  const now = new Date();
  const expiry = checkExpiry(draft.expires_at, now);
  if (!expiry.ok) return NextResponse.json({ error: expiry.reason === "expiry_in_past" ? "The expiry must not be in the past." : `A share can last at most ${MAX_SHARE_DAYS} days.` }, { status: 422 });
  try {
    const rec = await supabase.from("recipients").select("recipient_code, name, org").eq("recipient_code", draft.recipient_code);
    const recipient = (rec.data ?? [])[0] as { recipient_code: string; name: string; org: string } | undefined;
    if (!recipient) return NextResponse.json({ error: "Unknown recipient." }, { status: 404 });
    const result = await reverifyAndView(supabase, draft.fields, now, serverKey("ISSUER_PUBLIC_KEY"));
    const overbroad = checkRequest({ recipient_purpose: recipient.org, purpose: draft.purpose, requested: draft.fields }, loadPacks());
    await append(supabase, "share.previewed", { recipient_code: draft.recipient_code, purpose: draft.purpose, field_count: draft.fields.length, over_broad: overbroad.flagged });
    return NextResponse.json({ draft, recipient, ...result, overbroad, previewToken: previewToken(draft, serverKey("VAULT_PRIVATE_KEY"), now) });
  } catch (e) {
    log("error", "share preview failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("prepare the preview");
  }
}
