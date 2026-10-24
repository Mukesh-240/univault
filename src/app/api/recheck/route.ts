/**
 * POST /api/recheck — issuer re-check (spec F20), run from the /shares page (button + every 60 s while
 * the page is open). The same check also runs on a schedule without anyone watching:
 * GET /api/cron/recheck (Vercel Cron). The steps live in src/lib/recheck.ts: re-verify every document
 * used by an active share; alert once per change (revoked / changed / expired); an unreachable issuer
 * is "unknown", never a failure. Nothing is revoked automatically: the owner decides.
 */
import { NextResponse } from "next/server";
import { recheckActiveShares } from "@/lib/recheck";
import { log } from "@/lib/scrub";
import { DEMO_OWNER, serverError, serverKey } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json(await recheckActiveShares(supabase, { owner: DEMO_OWNER, issuerPub: serverKey("ISSUER_PUBLIC_KEY"), now: new Date(), source: "page" }));
  } catch (e) {
    log("error", "recheck failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("re-check the issuers");
  }
}
