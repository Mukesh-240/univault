/**
 * GET /api/notifications — the owner's bell: first opens, opens from a new device, attempts on a
 * killed/expired link, wrong recipient ID/code, and issuer changes affecting active shares.
 * (Ordinary repeat views are not notifications.) The bell polls this every 5 s, and also listens to
 * Supabase Realtime when a live database is configured.
 */
import { NextResponse } from "next/server";
import { log } from "@/lib/scrub";
import { DEMO_OWNER, serverError } from "@/lib/server";
import { listNotifications } from "@/lib/share-store";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ notifications: await listNotifications(supabase, DEMO_OWNER) });
  } catch (e) {
    log("error", "notifications failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("load notifications");
  }
}
