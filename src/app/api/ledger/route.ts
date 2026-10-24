/**
 * GET /api/ledger — re-check the whole hash-chained ledger right now ("Verify ledger" button).
 * Answers { ok, total, broken_at }: ok = every line's fingerprint still matches.
 */
import { NextResponse } from "next/server";
import { verify } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await verify(supabase));
  } catch (e) {
    log("error", "ledger check failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("check the ledger");
  }
}
