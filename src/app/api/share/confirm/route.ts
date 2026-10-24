/**
 * POST /api/share/confirm — the ONLY way a share can ever be created.
 * Body: { "draft": <exactly the previewed draft>, "preview_token": "<from /api/share/preview>", "idempotency_key": "<uuid>" }
 *
 * 1. The preview token must be genuine, unexpired and match this exact draft (else nothing happens —
 *    so no document text, assistant card or other code path can create a share).
 * 2. Idempotency: the same key always means the same share. A retry after a dropped connection gets the
 *    SAME receipt back instead of creating a second share.
 * 3. Every included document is re-verified right now; a mismatch, a replaced or a revoked record
 *    blocks the share until the person looks at it.
 * 4. The share, its states and its link are written (fingerprints only), and the RECEIPT is returned:
 *    the link is shown this once and never stored. (The recipient asks for a one-time code on the link page.)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkConfirmation, ShareDraftSchema, type ShareDraft } from "@/lib/consent";
import { verify } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { badRequest, DEMO_OWNER, serverError, serverKey } from "@/lib/server";
import { createShare, reverifyAndView, type Snapshot } from "@/lib/share-store";
import { hashIdempotencyKey, shareToken } from "@/lib/shares";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ draft: ShareDraftSchema, preview_token: z.string().max(2000).optional(), idempotency_key: z.string().uuid() });

/** The receipt the owner sees. The link appears here and nowhere else (only its fingerprint is stored). */
function receipt(shareId: string, createdAt: string, draft: ShareDraft, recipient: { recipient_code: string; name: string }, link: string, snap: Snapshot) {
  return { share_id: shareId, created_at: createdAt, recipient: { code: recipient.recipient_code, name: recipient.name }, purpose: draft.purpose,
    fields: draft.fields, expires_at: draft.expires_at, policy: draft.policy, link, verified: snap.docs, shown_once: true };
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { draft, preview_token, idempotency_key } = parsed.data;
  const now = new Date();
  const check = checkConfirmation(draft, preview_token, serverKey("VAULT_PUBLIC_KEY"), now);
  if (!check.ok) return NextResponse.json({ error: check.reason, shared: false }, { status: 403 });
  try {
    const secrets = shareToken(serverKey("VAULT_PRIVATE_KEY"), idempotency_key);
    const idem = hashIdempotencyKey(idempotency_key);
    const link = new URL(`/s/${secrets.token}`, req.url).toString();
    const rec = await supabase.from("recipients").select("recipient_code, name").eq("recipient_code", draft.recipient_code);
    const recipient = (rec.data ?? [])[0] as { recipient_code: string; name: string } | undefined;
    if (!recipient) return NextResponse.json({ error: "Unknown recipient." }, { status: 404 });

    // Same request again? Return the same receipt; create nothing.
    const prior = await supabase.from("shares").select("id, created_at, verification_snapshot").eq("verification_snapshot->>idem", idem);
    const existing = (prior.data ?? [])[0] as { id: string; created_at: string; verification_snapshot: Snapshot } | undefined;
    if (existing) return NextResponse.json({ replayed: true, receipt: receipt(existing.id, existing.created_at, draft, recipient, link, existing.verification_snapshot) });

    const { reverify, blocked } = await reverifyAndView(supabase, draft.fields, now, serverKey("ISSUER_PUBLIC_KEY"));
    if (blocked.length) return NextResponse.json({ error: "A document in this share doesn't currently match the issuer's record. Please look at it before sharing.", reverify, shared: false }, { status: 409 });
    const snapshot: Snapshot = { idem, docs: reverify.map((r) => ({ id: r.id, title: r.title, doc_type: r.doc_type, state: r.state, checked_at: r.checked_at })) };
    const created = await createShare(supabase, { owner: DEMO_OWNER, draft, recipientName: recipient.name, tokenHash: secrets.tokenHash, snapshot, previewedAt: now.toISOString() });
    const ledger = await verify(supabase);
    return NextResponse.json({ replayed: false, receipt: { ...receipt(created.shareId, now.toISOString(), draft, recipient, link, snapshot), ledger_ok: ledger.ok, ledger_lines: ledger.total } }, { status: 201 });
  } catch (e) {
    log("error", "share confirm failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("create the share");
  }
}
