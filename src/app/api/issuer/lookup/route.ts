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
import { fromRow } from "@/lib/registry";
import { log } from "@/lib/scrub";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic"; // always run fresh; never cache issuer answers

/** How long a "down" issuer stalls before saying it is unavailable (longer than the app's 8 s limit). */
const DOWN_STALL_MS = 9000;

const Body = z.object({
  serial: z.string().min(1).max(80),
  delay_ms: z.number().int().min(0).max(15000).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  // 1. Check the request is well-formed.
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ simulated: true, error: 'Send JSON like {"serial": "..."}' }, { status: 400 });
  const { serial, delay_ms } = parsed.data;

  // 2. Is the simulated issuer switched off?
  const cfg = await supabase.from("issuer_config").select("is_down").eq("id", 1).single();
  if (cfg.error) {
    log("error", "issuer lookup: config read failed", { code: cfg.error.code });
    return NextResponse.json({ simulated: true, error: "Simulated issuer configuration unavailable" }, { status: 502 });
  }
  if ((cfg.data as { is_down: boolean }).is_down) {
    await sleep(delay_ms ?? DOWN_STALL_MS);
    return NextResponse.json({ simulated: true, issuer: "SIMULATED ISSUER", reachable: false, error: "Simulated issuer is down" }, { status: 503 });
  }

  // 3. Optional artificial slowness (for timeout tests), then look the serial up.
  if (delay_ms) await sleep(delay_ms);
  const rows = await supabase.from("issuer_registry").select("*").eq("serial", serial).order("version", { ascending: false });
  if (rows.error) {
    log("error", "issuer lookup: registry read failed", { code: rows.error.code });
    return NextResponse.json({ simulated: true, error: "Simulated issuer registry unavailable" }, { status: 502 });
  }

  // 4. Answer with the newest version as `entry`, plus the full version history (newest first).
  const history = (rows.data ?? []).map((r) => fromRow(r as Record<string, unknown>));
  return NextResponse.json({
    simulated: true, issuer: "SIMULATED ISSUER", reachable: true,
    entry: history[0] ?? null, history, served_at: new Date().toISOString(),
  });
}
