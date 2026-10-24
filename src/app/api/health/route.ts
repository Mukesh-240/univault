/**
 * GET /api/health — is the app up, and can it reach its database? Answers only
 * { ok, db: "up" | "down", time } — no versions, keys or configuration details.
 */
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let db: "up" | "down" = "down";
  try {
    const r = await supabase.from("issuer_config").select("id").eq("id", 1).single();
    if (!r.error) db = "up";
  } catch { /* not configured or unreachable: reported as "down" */ }
  return NextResponse.json({ ok: db === "up", db, time: new Date().toISOString() }, { status: db === "up" ? 200 : 503 });
}
