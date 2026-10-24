/**
 * POST /api/auth/code — sign-in step 1: "send" a one-time code for a demo number (SIMULATED).
 *
 * Plain English: the person typed a demo Aadhaar-style number. We check its shape (starts with 0000, valid
 * check digit), make a fresh 6-digit code and SHOW it on screen: no SMS or email is sent. The code works
 * for 10 minutes. We do not keep the number or the code: a signed cookie holds only keyed fingerprints of
 * both, so the next step can check them. A new request makes a new code and replaces the old one.
 * If this number is locked (5 wrong codes), nothing is sent until the 15 minutes are over.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionSecret } from "@/lib/auth-server";
import { clientIp, hit, lockState } from "@/lib/rate-limit";
import { log } from "@/lib/scrub";
import { CHALLENGE_COOKIE, CODE_TTL_SECONDS, cookieOptions, fingerprint, isSecure, seal, type ChallengePayload } from "@/lib/session";
import { newOneTimeCode } from "@/lib/shares";
import { validate } from "@/lib/synthetic-aadhaar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ number: z.string().max(40) });
const PER_IP = { max: 30, windowMs: 60_000 };

export async function POST(req: Request) {
  const secret = sessionSecret();
  if (!secret) return NextResponse.json({ error: "Sign-in is not set up on this server.", problem: "not_configured" }, { status: 503 });
  const slow = hit(`signin-ip|${clientIp(req)}`, PER_IP);
  if (!slow.ok) return NextResponse.json({ error: "Too many tries. Please wait a minute.", problem: "slow_down", retryAfterS: slow.retryAfterS }, { status: 429, headers: { "retry-after": String(slow.retryAfterS) } });

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Please enter your demo number.", problem: "empty" }, { status: 422 });
  const v = validate(body.data.number);
  if (!v.ok) return NextResponse.json({ error: "That number cannot be used.", problem: v.problem }, { status: 422 });

  const nm = await fingerprint(secret, "number", v.digits);
  const lock = lockState(`signin|${nm}`);
  if (lock.locked) return NextResponse.json({ error: "Locked for a while after too many wrong codes.", problem: "locked", retryAfterS: lock.retryAfterS }, { status: 429, headers: { "retry-after": String(lock.retryAfterS) } });

  const code = newOneTimeCode();
  const payload: ChallengePayload = {
    kind: "challenge", stage: "code", nm, cm: await fingerprint(secret, "code", code), last4: v.digits.slice(-4),
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS,
  };
  const res = NextResponse.json({ simulated: true, code, validForMinutes: CODE_TTL_SECONDS / 60 }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(CHALLENGE_COOKIE, await seal(payload, secret), cookieOptions(CODE_TTL_SECONDS, isSecure(req)));
  log("info", "sign-in code issued", {}); // never the number or the code
  return res;
}
