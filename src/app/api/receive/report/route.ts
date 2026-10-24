/**
 * POST /api/receive/report { share_id, reason } — a receiver reports a problem with something shared with it.
 * The reason is one of three fixed choices (no free text), and only a share addressed to THIS receiver is accepted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, receiverCode } from "@/lib/auth-server";
import { REPORT_REASONS, reportProblem } from "@/lib/receiver-portal";
import { log } from "@/lib/scrub";
import { badRequest, serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ share_id: z.string().uuid(), reason: z.enum(REPORT_REASONS) });

export async function POST(req: Request) {
  const code = receiverCode(await currentSession());
  if (!code) return NextResponse.json({ error: "Only a receiver can do this." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    if (!(await reportProblem(supabase, code, parsed.data.share_id, parsed.data.reason))) return NextResponse.json({ error: "That share is not yours." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log("error", "report failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("send this report");
  }
}
