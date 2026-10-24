/**
 * HELP — which "Need help?" panel belongs to which screen.
 *
 * Plain-English picture: every screen has a 3-step help panel. The text lives in the locale files under
 * help.<screen>.title and help.<screen>.1 / .2 / .3 (English and Telugu). This file only decides which
 * <screen> the current address belongs to; tests/i18n-parity.test.ts checks that every screen listed here
 * has all four strings in both languages.
 */

export const HELP_SCREENS = [
  "signin", "home", "add", "doc", "ready", "share", "shares", "alerts", "scan", "names", "more",
  "check", "history", "trace", "assistant", "faults", "threat", "policy", "issuer", "issue", "issued", "inbox", "ask", "requests", "view", "area",
] as const;
export type HelpScreen = (typeof HELP_SCREENS)[number];

const EXACT: Record<string, HelpScreen> = {
  "/": "home", "/signin": "signin", "/readiness": "ready", "/share": "share", "/shares": "shares", "/alerts": "alerts", "/ocr": "scan",
  "/names": "names", "/more": "more", "/verify": "check", "/ledger": "history", "/leak-trace": "trace", "/assistant": "assistant",
  "/faults": "faults", "/threat-model": "threat", "/policy": "policy",
  "/issuer": "issuer", "/issuer/issue": "issue", "/issuer/issued": "issued", "/issuer/activity": "issuer", "/issuer/more": "more",
  "/receive": "inbox", "/receive/ask": "ask", "/receive/requests": "requests", "/receive/more": "more", "/area": "area",
};

export function helpScreenFor(pathname: string): HelpScreen {
  if (EXACT[pathname]) return EXACT[pathname];
  if (pathname.startsWith("/doc/")) return "doc";
  if (pathname.startsWith("/receive/")) return "view";
  if (pathname.startsWith("/add")) return "add";
  return "home";
}
