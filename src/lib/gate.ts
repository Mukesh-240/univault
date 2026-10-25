/**
 * GATE — which addresses need a signed-in browser, and which ROLE may open which area, as pure functions the
 * middleware and the tests share.
 *
 * Plain-English picture:
 *   Most of the app needs the simulated sign-in. These stay open without it:
 *     - /signin and /api/auth/*   (that is how you sign in);
 *     - /s/<link> and its download (a recipient with no account uses the link, the recipient ID and a one-time code);
 *     - /api/health               (the uptime check);
 *     - /api/cron/*               (the scheduler; it has its own CRON_SECRET check);
 *     - /threat-model and /policy (anyone can read what we store and what we defend against BEFORE signing in).
 *   Signed in, three areas exist and each role has its own:
 *     - ISSUER   /issuer and /api/issuer-portal      (issue, list and revoke documents it issued; nothing else)
 *     - RECEIVER /receive and /api/receive           (shares addressed to it, requests, the viewer)
 *     - SENDER   everything else: the vault, readiness, shares, alerts, scan, names, ledger…
 *   A sender may also open the receiving area (same kind of account, shown as a "Sending | Receiving" switch);
 *   a receiver may not open the sender's vault; an issuer may open neither. Pages that are not for the role show
 *   a clear "This area is for …" page; API calls get 403. "/" goes to the role's own home.
 */
import type { Role } from "./session";

const PUBLIC_EXACT = ["/signin", "/api/health", "/threat-model", "/policy"];
const PUBLIC_PREFIX = ["/s/", "/api/cron/", "/api/auth/"];
/** Open to any signed-in role: the explainer page the guard sends people to, "What UNIVAULT can do" and the demo
 *  guide (they hold no personal data and every role needs them). */
const SHARED_EXACT = ["/area", "/features", "/demo"];
export const isSharedPath = (pathname: string) => SHARED_EXACT.includes(pathname);

export type Gate = "allow" | "signin" | "unauthorized" | "home" | "forbidden" | "redirect";
export type Area = "issuer" | "receive" | "sender";

export const isPublicPath = (pathname: string) => PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p));

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

/** Which area a path belongs to. */
export function areaOf(pathname: string): Area {
  if (under(pathname, "/issuer") || under(pathname, "/api/issuer-portal")) return "issuer";
  if (under(pathname, "/receive") || under(pathname, "/api/receive")) return "receive";
  return "sender";
}

/** May this role open this area? */
export const mayOpen = (role: Role, area: Area) => (role === "issuer" ? area === "issuer" : role === "sender" ? area !== "issuer" : area === "receive");

/** Where each role lands. */
export const homeFor = (role: Role) => (role === "issuer" ? "/issuer" : role === "receiver" ? "/receive" : "/");

/** The role's name as a plain area word, for the "This area is for …" page. */
export const roleOfArea = (a: Area): Role => (a === "issuer" ? "issuer" : a === "receive" ? "receiver" : "sender");

export function gateFor(pathname: string, role: Role | null): Gate {
  if (pathname === "/signin" && role) return "home";
  if (isPublicPath(pathname)) return "allow";
  if (!role) return pathname.startsWith("/api/") ? "unauthorized" : "signin";
  if (SHARED_EXACT.includes(pathname)) return "allow";
  if (pathname === "/" && role !== "sender") return "redirect";
  if (mayOpen(role, areaOf(pathname))) return "allow";
  return "forbidden";
}
