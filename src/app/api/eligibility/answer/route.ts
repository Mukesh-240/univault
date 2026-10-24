/**
 * POST /api/eligibility/answer { request_id, authorised: [rule ids] } — the holder authorises criteria one by one and
 * the server evaluates ONLY those, signs the answer (an attestation, not proof) and records it. Consent to evaluate
 * never gives the asker any document: the answer holds met / not met / unknown per criterion and nothing else.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { answerEligibility } from "@/lib/eligibility";
import { log } from "@/lib/scrub";
import { badRequest, DEMO_OWNER, loadDemoVault, serverError, serverKey } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ request_id: z.string().regex(/^[0-9a-f]{16}$/), authorised: z.array(z.string().max(60)).max(40) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const r = await answerEligibility(supabase, { holder: DEMO_OWNER, requestId: parsed.data.request_id, authorised: parsed.data.authorised, ctx: await loadDemoVault(), privB64: serverKey("VAULT_PRIVATE_KEY") });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json({ ok: true, overall: r.attestation.overall, criteria: r.attestation.results.length });
  } catch (e) {
    log("error", "eligibility answer failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("answer this request");
  }
}
