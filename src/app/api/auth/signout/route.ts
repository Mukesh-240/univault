/**
 * POST /api/auth/signout — "Sign out": remove the session cookie. The browser goes back to /signin.
 */
import { NextResponse } from "next/server";
import { cookieOptions, CHALLENGE_COOKIE, isSecure, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  for (const name of [SESSION_COOKIE, CHALLENGE_COOKIE]) res.cookies.set(name, "", { ...cookieOptions(0, isSecure(req)), maxAge: 0 });
  return res;
}
