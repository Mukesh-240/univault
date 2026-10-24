/**
 * POST /api/requests/decline { request_id } — the holder declines a request for documents. It is logged (ledger line),
 * nothing is shared, and the asking receiver sees "Declined" with no reason.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { declineRequest } from "@/lib/receiver-portal";
import { log } from "@/lib/scrub";
import { badRequest, DEMO_OWNER, serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ request_id: z.string().regex(/^[0-9a-f]{16}$/) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    if (!(await declineRequest(supabase, DEMO_OWNER, parsed.data.request_id))) return NextResponse.json({ error: "That request is not waiting for you." }, { status: 404 });
    return NextResponse.json({ declined: true });
  } catch (e) {
    log("error", "decline failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("decline this request");
  }
}
