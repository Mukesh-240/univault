/**
 * POST /api/issuer-portal/holder { q } — find a holder to issue to, by name or by demo ID (sent in the body, never in the web address).
 *
 * Plain English: answers with the matching demo senders: their name and their MASKED demo ID (only the last four
 * digits). It never returns a full number and never anything from a vault.
 */
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth-server";
import { loadProfiles } from "@/lib/profiles";
import { clientIp, hit } from "@/lib/rate-limit";
import { supabase } from "@/lib/supabase";
import { digitsOnly, mask } from "@/lib/synthetic-aadhaar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await currentSession();
  if (session?.role !== "issuer") return NextResponse.json({ error: "Only an issuer can do this." }, { status: 403 });
  const slow = hit(`holder-search|${clientIp(req)}`, { max: 60, windowMs: 60_000 });
  if (!slow.ok) return NextResponse.json({ error: "Too many searches. Please wait a minute." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { q?: unknown } | null;
  const q = (typeof body?.q === "string" ? body.q : "").trim().slice(0, 60).toLowerCase();
  const digits = digitsOnly(q);
  const people = (await loadProfiles(supabase)).filter((p) => p.role === "sender")
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (digits.length >= 4 && p.number.includes(digits)))
    .map((p) => ({ ref: p.ref, name: p.name, masked: mask(p.number) }));
  return NextResponse.json({ holders: people });
}
