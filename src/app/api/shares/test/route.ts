/**
 * POST /api/shares/test — "Test this link now": what would the link answer right now?
 * Body: { "share_id": "<uuid>" }. Runs the same link check the recipient page runs (shares.linkStatus)
 * on the stored facts, and records that the owner tested it (ledger line). It is not a recipient visit,
 * so it is not counted as an access.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { append } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { badRequest, DEMO_OWNER, serverError } from "@/lib/server";
import { loadShares } from "@/lib/share-store";
import { linkStatus } from "@/lib/shares";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ share_id: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const s = (await loadShares(supabase, DEMO_OWNER)).find((x) => x.id === parsed.data.share_id);
    if (!s) return NextResponse.json({ error: "Share not found." }, { status: 404 });
    const status = linkStatus({ shareRevoked: s.state === "revoked", tokenKilled: s.tokenKilled, expiresAt: s.expiresAt, recipientCode: s.recipientCode, policy: s.policy.mode }, new Date());
    await append(supabase, "share.tested", { share_id: s.id, result: status });
    return NextResponse.json({ share_id: s.id, result: status, denied: status !== "active" });
  } catch (e) {
    log("error", "link test failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("test this link");
  }
}
