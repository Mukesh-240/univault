/**
 * POST /api/receive/ask { holder_ref, items: ["doc_type.field", ...] } — a receiver asks a person for items.
 *
 * Plain English: the receiver identity and registered purpose come from the signed session and the recipients table,
 * never from the request, so a request cannot claim a different purpose. The over-broad check (the same one as
 * /api/requests/check) flags anything beyond what the purpose needs; the person is told. Only ids and item names are
 * recorded (no free text), so nothing personal enters the append-only history.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, receiverCode } from "@/lib/auth-server";
import { findProfile, loadProfiles } from "@/lib/profiles";
import { sendRequest } from "@/lib/receiver-portal";
import { log } from "@/lib/scrub";
import { badRequest, serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ holder_ref: z.string().min(1).max(200), items: z.array(z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)?$/)).min(1).max(40) });

export async function POST(req: Request) {
  const code = receiverCode(await currentSession());
  if (!code) return NextResponse.json({ error: "Only a receiver can do this." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const holder = findProfile(await loadProfiles(supabase), "sender", parsed.data.holder_ref);
    if (!holder) return NextResponse.json({ error: "We could not find that person." }, { status: 404 });
    const rec = await supabase.from("recipients").select("org").eq("recipient_code", code).single();
    if (rec.error || !rec.data) return NextResponse.json({ error: "Unknown receiver." }, { status: 404 });
    const r = await sendRequest(supabase, { from: code, fromPurpose: (rec.data as { org: string }).org, to: holder.ref, items: parsed.data.items });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json({ ok: true, id: r.id, flagged: r.flagged, to: holder.name }, { status: 201 });
  } catch (e) {
    log("error", "ask failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("send this request");
  }
}
