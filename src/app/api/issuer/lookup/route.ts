/**
 * POST /api/issuer/lookup — the SIMULATED ISSUER's "look up a serial number" service.
 *
 * Plain-English picture:
 *   UNIVAULT asks: "what do you have on record for serial X?". This pretend issuer answers with its
 *   signed registry entry (fingerprints + status + signature) — never the document's actual values.
 *   It also lets us rehearse failures:
 *     - if the issuer is switched "down" (issuer_config.is_down, toggled from the fault panel), it
 *       waits longer than UNIVAULT is willing to wait (default 9 s > the 8 s limit) and then
 *       answers "unavailable", so the app must show "Unverified: issuer unreachable, retrying";
 *     - an optional artificial delay (delay_ms) can be added for timeout tests.
 *
 * Request body (JSON):  { "serial": "<serial number>", "delay_ms": <optional, 0..15000> }
 * The serial goes in the BODY, not the web address, because sensitive values must never be in URLs.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { issuerLookup } from "@/lib/issuer-service";
import { log } from "@/lib/scrub";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic"; // always run fresh; never cache issuer answers
export const runtime = "nodejs";

const Body = z.object({
  serial: z.string().min(1).max(80),
  delay_ms: z.number().int().min(0).max(15000).optional(),
});

export async function POST(req: Request) {
  // 1. Check the request is well-formed.
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ simulated: true, error: 'Send JSON like {"serial": "..."}' }, { status: 400 });
  // 2. Ask the simulated issuer (the logic lives in src/lib/issuer-service.ts).
  try {
    const a = await issuerLookup(supabase, parsed.data.serial, { delayMs: parsed.data.delay_ms });
    if (!a.reachable) return NextResponse.json({ simulated: true, issuer: "SIMULATED ISSUER", reachable: false, error: "Simulated issuer is down" }, { status: 503 });
    // 3. Newest version as `entry`, plus the full version history (newest first).
    return NextResponse.json({ simulated: true, issuer: "SIMULATED ISSUER", reachable: true, entry: a.history[0] ?? null, history: a.history, served_at: new Date().toISOString() });
  } catch (e) {
    log("error", "issuer lookup failed", { message: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ simulated: true, error: "Simulated issuer registry unavailable" }, { status: 502 });
  }
}
