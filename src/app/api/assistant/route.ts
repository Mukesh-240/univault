/**
 * POST /api/assistant — "Get me ready for <purpose>".   Body: { "purpose": "scholarship" }
 *
 * Returns PROPOSAL CARDS only. This route cannot share, verify or change anything: it reads the vault
 * and the rule pack and answers. Document text never influences the cards (see src/lib/assistant.ts).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getReady } from "@/lib/assistant";
import { loadPacks } from "@/lib/rules";
import { log } from "@/lib/scrub";
import { badRequest, loadDemoVault, serverError } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ purpose: z.string().min(1).max(60) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const packs = loadPacks();
    if (!packs.some((p) => p.id === parsed.data.purpose || p.purpose === parsed.data.purpose))
      return NextResponse.json({ error: `No rule pack for "${parsed.data.purpose}".`, available: packs.map((p) => p.id) }, { status: 404 });
    return NextResponse.json(getReady(parsed.data.purpose, await loadDemoVault(), packs));
  } catch (e) {
    log("error", "assistant failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("prepare suggestions");
  }
}
