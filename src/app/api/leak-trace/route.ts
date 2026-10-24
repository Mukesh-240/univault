/**
 * POST /api/leak-trace — "who leaked this screenshot?"
 * Body: { "text": "<what you can read in the watermark>" }
 * The watermark reads "<name> · <recipient code> · <time> · <session code>". The recipient code and the
 * session code are looked up among the logged openings, and the matching recipient, share and every
 * access event on that link are returned. The search itself is recorded in the ledger (not the text).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { append } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { badRequest, DEMO_OWNER, serverError } from "@/lib/server";
import { loadShares } from "@/lib/share-store";
import { matchLeak } from "@/lib/shares";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ text: z.string().min(1).max(500) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const shares = await loadShares(supabase, DEMO_OWNER);
    const openings = shares.flatMap((s) => s.accesses.filter((a) => a.session).map((a) => ({
      session: a.session, recipientCode: s.recipientCode, recipientName: s.recipientName, shareId: s.id, purpose: s.purpose, at: a.at, device: a.device, outcome: a.outcome })));
    const { parsed: read, matches } = matchLeak(parsed.data.text, openings);
    await append(supabase, "leak_trace.run", { matched: matches.length, by_session: Boolean(read.session), by_recipient: Boolean(read.recipientCode) });
    const events = Object.fromEntries([...new Set(matches.map((m) => m.shareId))].map((id) => [id, shares.find((s) => s.id === id)!.accesses]));
    return NextResponse.json({ read, matches, events });
  } catch (e) {
    log("error", "leak trace failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("trace this watermark");
  }
}
