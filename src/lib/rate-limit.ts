/**
 * RATE LIMIT — "slow down" for the recipient pages (/s/<link> and its download).
 *
 * Plain-English picture:
 *   Each visitor address (IP) and each link may make only so many requests per minute. Past that, the
 *   page answers 429 "Too many attempts, wait a minute" and does nothing else (no database work).
 *   Counting is a simple fixed window: a counter per key that starts over every minute.
 *
 * HONEST LIMIT: the counters live in this server process's memory. On Vercel each serverless instance
 * has its own counters, and a cold start begins at zero, so a determined attacker spread across
 * instances gets more than the stated limit. The 5-wrong-codes lock (shares.ts lockedUntil) does NOT
 * have this weakness: it is worked out from the access log in the database.
 * ponytail: per-instance memory; move to a shared store (e.g. Upstash Redis) if real traffic needs it.
 */

export interface Limit { max: number; windowMs: number }

/** Requests allowed per minute: per visitor address, and per link (whoever is asking). */
export const RECIPIENT_LIMITS = { perIp: { max: 60, windowMs: 60_000 }, perToken: { max: 20, windowMs: 60_000 } } satisfies Record<string, Limit>;

/** Above this many keys, finished windows are swept out, so memory can't grow without end. */
const SWEEP_AT = 10_000;

type Buckets = Map<string, { count: number; resetAt: number }>;
const buckets = (): Buckets => {
  const g = globalThis as unknown as { __univaultRate?: Buckets };
  return (g.__univaultRate ??= new Map());
};

/** Count one request for `key`. Allowed, or refused with how many seconds to wait. */
export function hit(key: string, limit: Limit, now = Date.now()): { ok: true } | { ok: false; retryAfterS: number } {
  const b = buckets();
  if (b.size > SWEEP_AT) for (const [k, v] of b) if (v.resetAt <= now) b.delete(k);
  const cur = b.get(key);
  if (!cur || cur.resetAt <= now) { b.set(key, { count: 1, resetAt: now + limit.windowMs }); return { ok: true }; }
  if (cur.count >= limit.max) return { ok: false, retryAfterS: Math.ceil((cur.resetAt - now) / 1000) };
  cur.count++;
  return { ok: true };
}

/**
 * The visitor's address. Vercel puts the real client address first in x-forwarded-for (and overwrites
 * whatever the client sent). Self-hosted without a proxy, that header can be faked: the per-link limit
 * and the database lock still apply.
 */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Both recipient limits at once: this address, and this link. */
export function recipientLimit(req: Request, tokenHash: string, now = Date.now()): { ok: true } | { ok: false; retryAfterS: number } {
  const ip = hit(`ip|${clientIp(req)}`, RECIPIENT_LIMITS.perIp, now);
  if (!ip.ok) return ip;
  return hit(`token|${tokenHash}`, RECIPIENT_LIMITS.perToken, now);
}
