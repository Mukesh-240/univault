/**
 * POST /api/auth/verify — sign-in step 2: check the one-time code.
 *
 * Plain English: the person typed the 6-digit code. We compare keyed fingerprints with what the sign-in
 * cookie holds (we never kept the number or the code). Five wrong codes in a row lock that number for 15
 * minutes (the same lock helper the rest of the app uses; it counts per server instance, which the README
 * states). A right code moves the sign-in on to the consent screen and returns the demo record the
 * simulated issuer would hand over: name, date of birth and a MASKED id number, read from the vault.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionSecret } from "@/lib/auth-server";
import { personRecord } from "@/lib/person";
import { clearFailures, clientIp, hit, lockState, recordFailure, SIGNIN_LOCK } from "@/lib/rate-limit";
import { log } from "@/lib/scrub";
import { loadDemoVault } from "@/lib/server";
import { CHALLENGE_COOKIE, CODE_TTL_SECONDS, cookieOptions, fingerprint, isSecure, open, sameString, seal, type ChallengePayload } from "@/lib/session";
import { mask, validate } from "@/lib/synthetic-aadhaar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ number: z.string().max(40), code: z.string().max(12) });
const PER_IP = { max: 30, windowMs: 60_000 };

export async function POST(req: Request) {
  const secret = sessionSecret();
  if (!secret) return NextResponse.json({ error: "Sign-in is not set up on this server.", problem: "not_configured" }, { status: 503 });
  const slow = hit(`signin-ip|${clientIp(req)}`, PER_IP);
  if (!slow.ok) return NextResponse.json({ error: "Too many tries. Please wait a minute.", problem: "slow_down", retryAfterS: slow.retryAfterS }, { status: 429, headers: { "retry-after": String(slow.retryAfterS) } });

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Please enter the code.", problem: "empty_code" }, { status: 422 });
  const v = validate(body.data.number);
  if (!v.ok) return NextResponse.json({ error: "That number cannot be used.", problem: v.problem }, { status: 422 });

  const nm = await fingerprint(secret, "number", v.digits);
  const key = `signin|${nm}`;
  const lock = lockState(key);
  if (lock.locked) return NextResponse.json({ error: "Locked for a while after too many wrong codes.", problem: "locked", retryAfterS: lock.retryAfterS }, { status: 429, headers: { "retry-after": String(lock.retryAfterS) } });

  const chal = await open<ChallengePayload>((await cookies()).get(CHALLENGE_COOKIE)?.value, "challenge", secret);
  // No code was asked for, it ran out, or it was asked for a different number: start again from step 1.
  if (!chal || chal.stage !== "code" || !sameString(chal.nm, nm)) return NextResponse.json({ error: "That code has run out. Please ask for a new one.", problem: "expired" }, { status: 400 });

  if (!sameString(chal.cm, await fingerprint(secret, "code", body.data.code.trim()))) {
    const f = recordFailure(key, SIGNIN_LOCK);
    log("warn", "sign-in wrong code", { locked: f.locked });
    if (f.locked) return NextResponse.json({ error: "Locked for 15 minutes after 5 wrong codes.", problem: "locked", retryAfterS: f.retryAfterS }, { status: 429, headers: { "retry-after": String(f.retryAfterS) } });
    return NextResponse.json({ error: "That code is not right.", problem: "wrong_code", triesLeft: f.left }, { status: 403 });
  }

  clearFailures(key);
  const record = personRecord((await loadDemoVault()).docs);
  const next: ChallengePayload = { ...chal, stage: "verified", exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS };
  const res = NextResponse.json({ ok: true, record: { name: record.name, dob: record.dob, idMasked: record.idMasked ?? mask(v.digits) } }, { headers: { "cache-control": "no-store" } });
  res.cookies.set(CHALLENGE_COOKIE, await seal(next, secret), cookieOptions(CODE_TTL_SECONDS, isSecure(req)));
  return res;
}
