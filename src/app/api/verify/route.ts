/**
 * POST /api/verify — check one document with the SIMULATED ISSUER and record the result.
 *
 * Body: { "document_id": "<uuid>", "first_failure_at"?: "<ISO time>", "attempts_made"?: 0..4 }
 *   The last two are the client-polled retry state: when the issuer was unreachable, the screen
 *   calls again at the times given in `retry.nextRetryAt` (10 s, 30 s, 60 s, 120 s after the first
 *   failure), passing these back, until it succeeds or offers "Retry now".
 *
 * Steps: load the document -> (scans: require every OCR field confirmed) -> ask the issuer (max 8 s)
 *        -> signature check -> status -> hash/field comparison -> append a document event (state +
 *        full outcome) and a ledger line (state, registry version, time) -> answer with the outcome.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { log } from "@/lib/scrub";
import { badRequest, serverError, serverKey } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { runVerification } from "@/lib/verify-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  document_id: z.string().uuid(),
  first_failure_at: z.string().datetime().optional(),
  attempts_made: z.number().int().min(0).max(4).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { document_id, first_failure_at, attempts_made } = parsed.data;
  try {
    // The steps live in src/lib/verify-run.ts (shared with the share builder and the issuer re-check).
    const r = await runVerification(supabase, document_id, serverKey("ISSUER_PUBLIC_KEY"),
      first_failure_at ? { firstFailureAt: first_failure_at, attemptsMade: attempts_made ?? 0 } : undefined);
    if (!r.ok) return NextResponse.json({ error: r.error, ...(r.unconfirmed ? { unconfirmed: r.unconfirmed } : {}) }, { status: r.status });
    return NextResponse.json({ ...r.outcome, ledger_seq: r.ledgerSeq });
  } catch (e) {
    log("error", "verify failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("verify this document");
  }
}
