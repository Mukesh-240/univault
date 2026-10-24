/**
 * POST /api/receive/holder { q } — a receiver looks for a person to ask, by name or demo ID (sent in the body, never
 * in the web address). Answers with names and MASKED demo IDs only; never a full number, never anything from a vault.
 */
import { NextResponse } from "next/server";
import { currentSession, receiverCode } from "@/lib/auth-server";
import { loadProfiles } from "@/lib/profiles";
import { clientIp, hit } from "@/lib/rate-limit";
import { supabase } from "@/lib/supabase";
import { digitsOnly, mask } from "@/lib/synthetic-aadhaar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!receiverCode(await currentSession())) return NextResponse.json({ error: "Only a receiver can do this." }, { status: 403 });
  const slow = hit(`recv-holder|${clientIp(req)}`, { max: 60, windowMs: 60_000 });
  if (!slow.ok) return NextResponse.json({ error: "Too many searches. Please wait a minute." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { q?: unknown } | null;
  const q = (typeof body?.q === "string" ? body.q : "").trim().slice(0, 60).toLowerCase();
  const digits = digitsOnly(q);
  const holders = (await loadProfiles(supabase)).filter((p) => p.role === "sender")
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (digits.length >= 4 && p.number.includes(digits)))
    .map((p) => ({ ref: p.ref, name: p.name, masked: mask(p.number) }));
  return NextResponse.json({ holders });
}
