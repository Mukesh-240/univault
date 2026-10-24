/**
 * GATE — which addresses need a signed-in browser, as one pure function the middleware and the tests share.
 *
 * Plain-English picture:
 *   Most of the app needs the simulated sign-in. These stay open without it:
 *     - /signin and /api/auth/*   (that is how you sign in);
 *     - /s/<link> and its download (a recipient never has an account; they use the link, the recipient ID
 *       and a one-time code), and /s/preview;
 *     - /api/health               (the uptime check);
 *     - /api/cron/*               (the scheduler; it has its own CRON_SECRET check);
 *     - /threat-model and /policy (anyone should be able to read what we store and what we defend against
 *       BEFORE signing in).
 *   A signed-in browser that opens /signin is sent home. Everything else without a session: pages go to
 *   /signin, API calls get 401 (a fetch cannot follow a "please sign in" page).
 */

const PUBLIC_EXACT = ["/signin", "/api/health", "/threat-model", "/policy"];
const PUBLIC_PREFIX = ["/s/", "/api/cron/", "/api/auth/"];

export type Gate = "allow" | "signin" | "unauthorized" | "home";

export const isPublicPath = (pathname: string) => PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p));

export function gateFor(pathname: string, hasSession: boolean): Gate {
  if (pathname === "/signin" && hasSession) return "home";
  if (isPublicPath(pathname) || hasSession) return "allow";
  return pathname.startsWith("/api/") ? "unauthorized" : "signin";
}
