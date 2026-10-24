/**
 * GET /api/issuer/status — is the SIMULATED ISSUER up or down right now, and how many records does it hold?
 * Used by the fault panel and the "Retry now" logic. Contains no personal data.
 */
import { NextResponse } from "next/server";
import { log } from "@/lib/scrub";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [cfg, count] = await Promise.all([
    supabase.from("issuer_config").select("is_down, updated_at").eq("id", 1).single(),
    supabase.from("issuer_registry").select("id", { count: "exact", head: true }),
  ]);
  if (cfg.error || count.error) {
    log("error", "issuer status: read failed", { code: cfg.error?.code ?? count.error?.code });
    return NextResponse.json({ simulated: true, error: "Simulated issuer status unavailable" }, { status: 502 });
  }
  const c = cfg.data as { is_down: boolean; updated_at: string };
  return NextResponse.json({
    simulated: true, label: "SIMULATED ISSUER", is_down: c.is_down, updated_at: c.updated_at, registry_entries: count.count ?? 0,
  });
}
