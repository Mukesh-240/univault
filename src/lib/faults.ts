/**
 * FAULTS — the switches behind the fault-injection panel (spec F14), kept in the server's memory.
 *
 * Plain-English picture:
 *   For the demo we must be able to make things go wrong ON PURPOSE and show how UNIVAULT behaves:
 *     - issuer timeout   -> stored in the database's issuer_config.is_down (the simulated issuer stalls);
 *     - stale data       -> stored here: every verification made BEFORE the switch was turned on is
 *                           treated as older than 24 h, so it shows "stale" and must be re-checked;
 *                           a fresh verification after that is fresh again (that is the recovery);
 *     - malformed upload, conflicting update -> one-off actions (see /api/faults), nothing to remember;
 *     - connectivity loss -> lives in the browser only (no request can reach us while "offline").
 *   Nothing here looks at any particular person or document.
 */
import { STALE_AFTER_HOURS } from "./verify";

interface FaultState { staleSince: string | null }

/** One state per server process (kept on globalThis so every route sees the same switches). */
export function faultState(): FaultState {
  const g = globalThis as unknown as { __univaultFaults?: FaultState };
  return (g.__univaultFaults ??= { staleSince: null });
}

export function setStale(on: boolean, now = new Date()): void {
  faultState().staleSince = on ? now.toISOString() : null;
}

/**
 * The clock to judge a verification's freshness with. Under the "stale data" fault, a verification
 * made before the switch was turned on is judged one hour past the 24-hour limit.
 */
export function freshnessClock(checkedAt: string, now: Date): Date {
  const since = faultState().staleSince;
  if (!since || checkedAt >= since) return now;
  return new Date(Date.parse(checkedAt) + (STALE_AFTER_HOURS + 1) * 3_600_000);
}
