/**
 * POST /api/issuer-portal/revoke — an issuer stops a record it issued.
 * Body: { serial }
 *
 * Plain English: this appends a NEW signed version of the record with the status "revoked" (nothing is edited or
 * deleted). The next time the holder checks the document with the issuer, it shows as not accepted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession } from "@/lib/auth-server";
import { revokeSerial } from "@/lib/issuer-portal";
import { log } from "@/lib/scrub";
import { badRequest, serverError, serverKey } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ serial: z.string().min(3).max(80) });

export async function POST(req: Request) {
  const session = await currentSession();
  if (session?.role !== "issuer" || !session.ref) return NextResponse.json({ error: "Only an issuer can do this." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const r = await revokeSerial(supabase, session.ref, parsed.data.serial, serverKey("ISSUER_PRIVATE_KEY"));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, version: r.version });
  } catch (e) {
    log("error", "revoke failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("stop this record");
  }
}
