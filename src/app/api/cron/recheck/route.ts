/**
 * GET /api/cron/recheck — the SCHEDULED issuer re-check (Vercel Cron, see vercel.json).
 *
 * Plain English: Vercel calls this address on a timer and sends "Authorization: Bearer <CRON_SECRET>".
 * Only a caller who knows that secret may start a run; the comparison takes the same time whether the
 * guess is close or not (constant time), so the secret can't be found by timing. Without CRON_SECRET
 * configured the route refuses everything. The run itself is src/lib/recheck.ts (same pipeline as the
 * /shares page button). The answer is counts only: no titles or other document details.
 */
import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { recheckActiveShares } from "@/lib/recheck";
import { log } from "@/lib/scrub";
import { DEMO_OWNER, serverError, serverKey } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// One run asks the issuer about each shared document (at most 8 s when the issuer is down, then the rest
// are skipped), so allow up to a minute.
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth !== "ok") return NextResponse.json({ error: auth === "not_configured" ? "Scheduled re-check is not configured (CRON_SECRET)." : "Not authorized." }, { status: auth === "not_configured" ? 503 : 401 });
  try {
    const r = await recheckActiveShares(supabase, { owner: DEMO_OWNER, issuerPub: serverKey("ISSUER_PUBLIC_KEY"), now: new Date(), source: "cron" });
    log("info", "scheduled recheck done", { checked: r.checked, affected: r.affected.length, alerts: r.alerts_raised, unknown: r.unknown.length });
    return NextResponse.json({ checked: r.checked, affected: r.affected.length, alerts_raised: r.alerts_raised, unknown: r.unknown.length, checked_at: r.checked_at });
  } catch (e) {
    log("error", "scheduled recheck failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("re-check the issuers");
  }
}
