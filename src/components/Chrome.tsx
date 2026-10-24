"use client";
/**
 * CHROME — the frame around every page.
 *
 * Plain-English picture:
 *   - the permanent "SYNTHETIC DEMO DATA · SIMULATED ISSUER" banner (required on every screen);
 *   - a deep-blue top bar: shield mark + UNIVAULT, the big "తెలుగు | English" toggle, "Text size",
 *     and — once signed in — "Alerts" and "Profile";
 *   - signed in: a left side menu on wide screens and a bottom tab bar with five big tabs on phones
 *     (Home, Ready?, Shares, Alerts, More); everything else lives under More;
 *   - not signed in (the sign-in page, and the public Policy / Threat model pages): just the top bar;
 *   - a "Need help?" button on every screen, and the small print at the bottom.
 * The tab bar labels stay 18px at every text size so five tabs always fit a 360px phone.
 */
import { Bell, ClipboardCheck, Ellipsis, House, Share2, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { TextSize } from "@/lib/prefs";
import { DisplayMenu } from "./DisplayMenu";
import { HelpPanel } from "./HelpPanel";
import { useI18n } from "./I18n";
import { LangSwitch } from "./LangSwitch";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";

export interface ChromeUser { name: string | null; last4: string }

interface Item { href: string; tab: string; side: string; Icon: LucideIcon; here: (p: string) => boolean }
const MORE_PREFIXES = ["/more", "/ocr", "/names", "/verify", "/ledger", "/leak-trace", "/assistant", "/faults", "/threat-model", "/policy"];
const PRIMARY: Item[] = [
  { href: "/", tab: "nav.tab.home", side: "nav.side.home", Icon: House, here: (p) => p === "/" || p.startsWith("/doc/") || p.startsWith("/add") },
  { href: "/readiness", tab: "nav.tab.ready", side: "nav.side.ready", Icon: ClipboardCheck, here: (p) => p === "/readiness" },
  { href: "/shares", tab: "nav.tab.shares", side: "nav.side.shares", Icon: Share2, here: (p) => p.startsWith("/share") },
  { href: "/alerts", tab: "nav.tab.alerts", side: "nav.side.alerts", Icon: Bell, here: (p) => p === "/alerts" },
  { href: "/more", tab: "nav.tab.more", side: "nav.side.more", Icon: Ellipsis, here: (p) => MORE_PREFIXES.some((m) => p === m || p.startsWith(`${m}/`)) },
];
/** Also on the side menu (wide screens); on phones they are on the More page. */
const SECONDARY: [string, string][] = [
  ["/ocr", "nav.ocr"], ["/names", "nav.names"], ["/verify", "nav.verify"], ["/ledger", "nav.ledger"], ["/leak-trace", "nav.leak"],
  ["/assistant", "nav.assistant"], ["/faults", "nav.faults"], ["/threat-model", "footer.threatModel"], ["/policy", "footer.policy"],
];

export function Chrome({ user, size, contrast, offline, children }: {
  user: ChromeUser | null; size: TextSize; contrast: "high" | "normal"; offline: boolean; children: ReactNode;
}) {
  const { t } = useI18n();
  const path = usePathname();
  const full = Boolean(user) && !path.startsWith("/signin");

  return (
    <>
      <a href="#main" className="skip-link">{t("a11y.skip")}</a>
      {/* role="note": screen readers announce this as supplementary information on every page. */}
      <div role="note" className="banner">
        {t("banner.synthetic")} · {t("banner.simulatedIssuer")}
        {offline && <> · {t("banner.offlineStore")}</>}
      </div>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href={full ? "/" : "/signin"} className="brand"><ShieldCheck size={30} aria-hidden="true" /> UNIVAULT</Link>
          <div className="tools">
            <LangSwitch />
            <DisplayMenu initialSize={size} initialContrast={contrast} />
            {full && user && <><NotificationBell /><ProfileMenu name={user.name} last4={user.last4} /></>}
          </div>
        </div>
      </header>
      <div className="shell">
        {full && (
          <nav className="sidenav" aria-label={t("nav.label")}>
            <ul>
              {PRIMARY.map(({ href, side, Icon, here }) => (
                <li key={href}><Link href={href} aria-current={here(path) ? "page" : undefined}><Icon size={24} aria-hidden="true" /> {t(side)}</Link></li>
              ))}
              <li className="sub"><ul>
                {SECONDARY.map(([href, key]) => (
                  <li key={href}><Link href={href} aria-current={path === href ? "page" : undefined}>{t(key)}</Link></li>
                ))}
              </ul></li>
            </ul>
          </nav>
        )}
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
      {full && (
        <nav className="tabbar" aria-label={t("nav.label")}>
          {PRIMARY.map(({ href, tab, Icon, here }) => (
            <Link key={href} href={href} aria-current={here(path) ? "page" : undefined}><Icon aria-hidden="true" />{t(tab)}</Link>
          ))}
        </nav>
      )}
      <footer className="site-footer">
        <nav aria-label={t("footer.links")} className="footer-links">
          <ul>
            <li><Link href="/threat-model">{t("footer.threatModel")}</Link></li>
            <li><Link href="/policy">{t("footer.policy")}</Link></li>
          </ul>
        </nav>
        <p>{t("footer.issuer")}</p>
        <p>{t("footer.attestation")}</p>
      </footer>
      <HelpPanel />
    </>
  );
}
