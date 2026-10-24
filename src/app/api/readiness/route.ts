/**
 * GET /api/readiness            — readiness for every purpose (one entry per rule pack)
 * GET /api/readiness?purpose=X  — readiness for one purpose (X = pack id, e.g. "scholarship")
 *
 * Each rule line is pass / fail / unknown with its reason, documents, confidence, source
 * ("UNIVAULT demo rule pack v1 — demo rules, not official requirements") and review date.
 */
import { NextResponse } from "next/server";
import { evaluatePack, loadPacks } from "@/lib/rules";
import { log } from "@/lib/scrub";
import { loadDemoVault, serverError } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const purpose = new URL(req.url).searchParams.get("purpose");
  try {
    const packs = loadPacks();
    const chosen = purpose ? packs.filter((p) => p.id === purpose || p.purpose === purpose) : packs;
    if (!chosen.length) return NextResponse.json({ error: `No rule pack for "${purpose}".`, available: packs.map((p) => p.id) }, { status: 404 });
    const ctx = await loadDemoVault();
    return NextResponse.json({ today: ctx.today, readiness: chosen.map((p) => evaluatePack(p, ctx)) });
  } catch (e) {
    log("error", "readiness failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("work out readiness");
  }
}
