/**
 * CRON AUTH — is this request really from our scheduler?
 *
 * Plain English: the scheduler sends "Authorization: Bearer <CRON_SECRET>". Both sides are first turned
 * into SHA-256 fingerprints (always 32 bytes), then compared with timingSafeEqual, which takes the same
 * time no matter where the first difference is. So an attacker can't learn the secret letter by letter
 * from how fast the server says no. No secret configured = nobody is allowed.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function cronAuthorized(header: string | null, secret: string | undefined): "ok" | "denied" | "not_configured" {
  if (!secret) return "not_configured";
  if (!header) return "denied";
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`)) ? "ok" : "denied";
}
