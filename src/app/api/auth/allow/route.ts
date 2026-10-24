/**
 * POST /api/auth/allow — sign-in step 3: the person pressed "Allow". Start the session.
 *
 * Plain English: only a browser that just passed step 2 (the sign-in cookie says "verified") can get here.
 * We then give it the session cookie (HttpOnly, SameSite=Lax) holding the last four digits of the demo
 * number and the name from the vault, and remove the sign-in cookie. No user row is created and nothing
 * is written to the database.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionSecret } from "@/lib/auth-server";
import { personRecord } from "@/lib/person";
import { log } from "@/lib/scrub";
import { loadDemoVault } from "@/lib/server";
import {
  CHALLENGE_COOKIE, cookieOptions, isSecure, open, seal, SESSION_COOKIE, SESSION_DAYS, type ChallengePayload, type SessionPayload,
} from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = sessionSecret();
  if (!secret) return NextResponse.json({ error: "Sign-in is not set up on this server.", problem: "not_configured" }, { status: 503 });
  const chal = await open<ChallengePayload>((await cookies()).get(CHALLENGE_COOKIE)?.value, "challenge", secret);
  if (!chal || chal.stage !== "verified") return NextResponse.json({ error: "Please enter your number and code first.", problem: "expired" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  const session: SessionPayload = {
    kind: "session", last4: chal.last4, name: personRecord((await loadDemoVault()).docs).name, iat: now, exp: now + SESSION_DAYS * 86_400,
  };
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, await seal(session, secret), cookieOptions(SESSION_DAYS * 86_400, isSecure(req)));
  res.cookies.set(CHALLENGE_COOKIE, "", { ...cookieOptions(0, isSecure(req)), maxAge: 0 });
  log("info", "signed in", {});
  return res;
}
