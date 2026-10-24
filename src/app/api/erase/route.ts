/**
 * POST /api/erase — erase my document (spec F22).   Body: { "document_id": "<uuid>", "acknowledged": true }
 *
 * The person must first have seen the limits (the screen shows them and sends acknowledged: true):
 *   - copies already downloaded by a recipient cannot be recalled;
 *   - the document's fingerprint, type and event times remain (the cover record is immutable);
 *   - active shares that use the document are revoked first.
 * Then the content row (document_payloads — the only erasable table) is deleted, an "erased" event and a
 * ledger line are written. This prototype keeps no separate stored file, so there is none to delete.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { append } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { badRequest, DEMO_OWNER, serverError } from "@/lib/server";
import { killShare, loadShares } from "@/lib/share-store";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ document_id: z.string().uuid(), acknowledged: z.literal(true) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { document_id } = parsed.data;
  try {
    const doc = await supabase.from("documents").select("id, owner, document_payloads(document_id)").eq("id", document_id).single();
    const d = doc.data as { owner: string; document_payloads: unknown[] | null } | null;
    if (doc.error || !d || d.owner !== DEMO_OWNER) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    if (!d.document_payloads || (Array.isArray(d.document_payloads) && !d.document_payloads.length)) return NextResponse.json({ error: "This document was already erased." }, { status: 409 });

    // 1. Revoke every active share that used this document.
    const revoked: string[] = [];
    for (const s of await loadShares(supabase, DEMO_OWNER))
      if (s.state === "active" && s.snapshot.docs.some((x) => x.id === document_id) && await killShare(supabase, s.id, "document erased")) revoked.push(s.id);
    // 2. Delete the content, 3. record what happened.
    const del = await supabase.from("document_payloads").delete().eq("document_id", document_id);
    if (del.error) throw new Error(del.error.message);
    const ev = await supabase.from("document_events").insert({ document_id, state: "erased", detail: { revoked_shares: revoked.length } });
    if (ev.error) throw new Error(ev.error.message);
    await append(supabase, "document.erased", { document_id, revoked_shares: revoked });
    return NextResponse.json({ erased: true, revoked_shares: revoked, kept: ["fingerprint", "document type", "event times"] });
  } catch (e) {
    log("error", "erase failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("erase this document");
  }
}
