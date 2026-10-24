/**
 * POST /api/shares/kill — stop access.
 * Body: { "share_id": "<uuid>" }  kills that one link (its share is revoked; other shares keep working)
 *       { "all": true }           kills every active link
 * Each kill is a new token event + share event + ledger line. Honest limit: copies a recipient already
 * downloaded cannot be recalled.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { log } from "@/lib/scrub";
import { badRequest, DEMO_OWNER, serverError } from "@/lib/server";
import { killShare, loadShares } from "@/lib/share-store";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.union([z.object({ share_id: z.string().uuid() }), z.object({ all: z.literal(true) })]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const b = parsed.data;
    const shares = await loadShares(supabase, DEMO_OWNER);
    const one = "share_id" in b ? b.share_id : null;
    if (one && !shares.some((s) => s.id === one)) return NextResponse.json({ error: "Share not found." }, { status: 404 });
    const targets = one ? [one] : shares.filter((s) => s.state === "active").map((s) => s.id);
    const killed: string[] = [];
    for (const id of targets) if (await killShare(supabase, id, one ? "owner killed this link" : "owner killed all links")) killed.push(id);
    return NextResponse.json({ killed, note: "Access stopped. If they already saved a copy, we can't remove it." });
  } catch (e) {
    log("error", "kill failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("stop access");
  }
}
