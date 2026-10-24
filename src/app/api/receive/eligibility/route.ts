/**
 * POST /api/receive/eligibility { holder_ref } — a receiver asks a person for an eligibility answer on the criteria of
 * ITS OWN registered purpose (taken from the recipients table, never from the request). The person authorises per
 * criterion; the answer arrives as a signed attestation. Nothing about any document is asked or returned.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, receiverCode } from "@/lib/auth-server";
import { requestEligibility } from "@/lib/eligibility";
import { findProfile, loadProfiles } from "@/lib/profiles";
import { log } from "@/lib/scrub";
import { badRequest, serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ holder_ref: z.string().min(1).max(200) });

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
    const r = await requestEligibility(supabase, { from: code, to: holder.ref, purpose: (rec.data as { org: string }).org });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json({ ok: true, id: r.id, to: holder.name }, { status: 201 });
  } catch (e) {
    log("error", "eligibility request failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("send this request");
  }
}
