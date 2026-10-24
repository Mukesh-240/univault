/**
 * POST /api/share/preview — show exactly what a share would reveal, and issue the preview token.
 * Body: { "recipient_code", "purpose", "fields": [...], "expires_at": "<ISO>", "policy": { "mode", "max_views"? } }
 *
 * The token proves the person saw THIS preview; /api/share/confirm refuses anything without it.
 * The token is returned to the person's browser only and is never stored.
 */
import { NextResponse } from "next/server";
import { MAX_SHARE_DAYS, previewToken, ShareDraftSchema } from "@/lib/consent";
import { recipientView } from "@/lib/disclosure";
import { log } from "@/lib/scrub";
import { badRequest, loadDemoVault, serverError, serverKey } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = ShareDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const draft = parsed.data;
  const now = new Date();
  const days = (Date.parse(draft.expires_at) - now.getTime()) / 86_400_000;
  if (days <= 0) return NextResponse.json({ error: "The expiry must be in the future." }, { status: 422 });
  if (days > MAX_SHARE_DAYS) return NextResponse.json({ error: `A share can last at most ${MAX_SHARE_DAYS} days.` }, { status: 422 });
  try {
    const view = recipientView(await loadDemoVault(now), draft.fields);
    return NextResponse.json({ draft, recipientView: view, previewToken: previewToken(draft, serverKey("VAULT_PRIVATE_KEY"), now) });
  } catch (e) {
    log("error", "share preview failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("prepare the preview");
  }
}
