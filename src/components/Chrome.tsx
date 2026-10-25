"use client";
/**
 * CHROME — the frame around every page, different for each role (issuer, sender, receiver).
 *   Top bar (56px): logo and name on the left; on the right search, the language toggle, the alerts bell (students)
 *   and the avatar menu, which holds Text size, High contrast, Help, the tour, What UNIVAULT can do, the demo guide,
 *   Switch role and Sign out. Signed-out public pages keep language, Text size and Help in the bar.
 *   Side menu (wide screens): at most six entries whose names say what they do, plus a small "Trust and demo" group
 *   at the bottom. Everything else lives inside those pages. Bottom tabs on phones.
 */
import {
  Activity, FileCheck2, FilePlus2, FileText, History, House, Inbox, LayoutDashboard, ListChecks, Search, Send, ShieldCheck, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Role } from "@/lib/session";
import type { TextSize } from "@/lib/prefs";
import { DisplayMenu } from "./DisplayMenu";
import { HelpPanel } from "./HelpPanel";
import { useI18n } from "./I18n";
import { LangSwitch } from "./LangSwitch";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { Popover } from "./Popover";
import { ProfileMenu } from "./ProfileMenu";
import { Tour } from "./Tour";

export interface ChromeUser { name: string | null; last4: string; role: Role; uvId: string }

/** `tab: null` = side menu only (phones reach it from the avatar menu, so the tab bar keeps five tabs). */
interface Item { href: string; tab: string | null; side: string; Icon: LucideIcon; here: (p: string) => boolean }
const under = (p: string, list: string[]) => list.some((m) => p === m || p.startsWith(`${m}/`));
const SENDER: Item[] = [
  { href: "/", tab: "nav2.tab.home", side: "nav2.home", Icon: House, here: (p) => p === "/" },
  { href: "/documents", tab: "nav2.tab.docs", side: "nav2.docs", Icon: FileText, here: (p) => under(p, ["/documents", "/doc", "/add", "/ocr", "/names", "/verify"]) },
  { href: "/readiness", tab: "nav2.tab.ready", side: "nav2.ready", Icon: ListChecks, here: (p) => p === "/readiness" },
  { href: "/alerts", tab: "nav2.tab.share", side: "nav2.share", Icon: Send, here: (p) => p === "/alerts" || p === "/share" },
  { href: "/shares", tab: "nav2.tab.access", side: "nav2.access", Icon: ShieldCheck, here: (p) => p === "/shares" },
  { href: "/ledger", tab: null, side: "nav2.proof", Icon: Activity, here: (p) => under(p, ["/ledger", "/leak-trace", "/faults", "/assistant", "/more"]) },
];
const ISSUER: Item[] = [
  { href: "/issuer", tab: "nav.issuer.tab.home", side: "nav.issuer.side.home", Icon: LayoutDashboard, here: (p) => p === "/issuer" },
  { href: "/issuer/issue", tab: "nav.issuer.tab.issue", side: "nav.issuer.side.issue", Icon: FilePlus2, here: (p) => p.startsWith("/issuer/issue") },
  { href: "/issuer/issued", tab: "nav.issuer.tab.issued", side: "nav.issuer.side.issued", Icon: FileCheck2, here: (p) => p.startsWith("/issuer/issued") },
  { href: "/issuer/activity", tab: "nav.issuer.tab.activity", side: "nav.issuer.side.activity", Icon: History, here: (p) => p.startsWith("/issuer/activity") || p.startsWith("/issuer/more") },
];
const RECEIVER: Item[] = [
  { href: "/receive", tab: "nav.recv.tab.inbox", side: "nav.recv.side.inbox", Icon: Inbox, here: (p) => p === "/receive" || /^\/receive\/(?!ask|requests|more|eligibility)/.test(p) },
  { href: "/receive/ask", tab: "nav.recv.tab.ask", side: "nav.recv.side.ask", Icon: Send, here: (p) => p.startsWith("/receive/ask") },
  { href: "/receive/eligibility", tab: "nav2.recv.tab.elig", side: "nav2.recv.elig", Icon: ListChecks, here: (p) => p.startsWith("/receive/eligibility") },
  { href: "/receive/requests", tab: "nav.recv.tab.requests", side: "nav.recv.side.requests", Icon: FileCheck2, here: (p) => p.startsWith("/receive/requests") || p.startsWith("/receive/more") },
];
/** The small "Trust and demo" group at the bottom of every side menu. */
const TRUST: [string, string][] = [["/features", "features.link"], ["/demo", "demo.link"], ["/threat-model", "footer.threatModel"], ["/policy", "footer.policy"]];
const MENUS: Record<Role, Item[]> = { sender: SENDER, issuer: ISSUER, receiver: RECEIVER };
const HOMES: Record<Role, string> = { sender: "/", issuer: "/issuer", receiver: "/receive" };
const SEARCH: Record<Role, string> = { sender: "/documents", issuer: "/issuer/issued", receiver: "/receive" };

export function Chrome({ user, size, contrast, offline, children }: {
  user: ChromeUser | null; size: TextSize; contrast: "high" | "normal"; offline: boolean; children: ReactNode;
}) {
  const { t } = useI18n();
  const path = usePathname();
  const full = Boolean(user) && !path.startsWith("/signin");
  const role: Role = user?.role ?? "sender";
  const menu = MENUS[role];
  // The sign-in page draws its own split screen (brand + form, with its own small footer): only the strip here.
  if (path.startsWith("/signin")) return (
    <>
      <a href="#main" className="skip-link">{t("a11y.skip")}</a>
      <p className="synthetic-strip" role="note">{t("strip.text")}{offline ? ` · ${t("banner.offlineStore")}` : ""}</p>
      <main id="main" tabIndex={-1} className="auth-main">{children}</main>
    </>
  );
  return (
    <>
      <a href="#main" className="skip-link">{t("a11y.skip")}</a>
      <div className="top-stack">
      {/* The persistent synthetic strip (FINAL_FEATURES 0.1): on every page, calm, never dismissible. */}
      <p className="synthetic-strip" role="note">{t("strip.text")}{offline ? ` · ${t("banner.offlineStore")}` : ""}</p>
      <header className="topbar">
        <div className="topbar-inner">
          <Link prefetch={false} href={full ? HOMES[role] : "/signin"} className="brand"><Logo size={36} priority /> <span className="wordmark">UNIVAULT</span></Link>
          <div className="tools">
            {full && (
              <Popover className="tool-search" label={<><Search size={20} aria-hidden="true" /><span className="sr-only">{t("ui.search")}</span></>} panelLabel={t("ui.search")}>
                <form role="search" action={SEARCH[role]} method="get" className="row">
                  <label htmlFor="top-q" className="sr-only">{t("ui.search")}</label>
                  <input id="top-q" name="q" type="search" autoComplete="off" placeholder={t("ui.search")} autoFocus />
                  <button type="submit">{t("ui.search")}</button>
                </form>
              </Popover>
            )}
            <LangSwitch />
            {!full && <DisplayMenu initialSize={size} initialContrast={contrast} />}
            {!full && <HelpPanel />}
            {full && user && role === "sender" && <NotificationBell />}
            {full && user && <ProfileMenu name={user.name} last4={user.last4} role={role} uvId={user.uvId} size={size} contrast={contrast} />}
          </div>
        </div>
      </header>
      </div>
      <div className={`shell role-${role}`}>
        {full && (
          <nav className="sidenav" aria-label={t("nav.label")}>
            <ul>
              {menu.map(({ href, side, Icon, here }) => (
                <li key={href}><Link prefetch={false} href={href} aria-current={here(path) ? "page" : undefined}><Icon size={20} aria-hidden="true" /> <span>{t(side)}</span></Link></li>
              ))}
            </ul>
            <p className="side-group">{t("nav2.trust")}</p>
            <ul className="side-trust">
              {TRUST.map(([href, key]) => <li key={href}><Link prefetch={false} href={href} aria-current={path === href ? "page" : undefined}>{t(key)}</Link></li>)}
            </ul>
          </nav>
        )}
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
      {full && (
        <nav className="tabbar" aria-label={t("nav.label")}>
          {menu.filter((m) => m.tab).map(({ href, tab, Icon, here }) => (
            <Link key={href} prefetch={false} href={href} aria-current={here(path) ? "page" : undefined}><Icon aria-hidden="true" />{t(tab!)}</Link>
          ))}
        </nav>
      )}
      <footer className="site-footer">
        <nav aria-label={t("footer.links")} className="footer-links">
          <ul>
            <li><Link prefetch={false} href="/threat-model">{t("footer.threatModel")}</Link></li>
            <li><Link prefetch={false} href="/policy">{t("footer.policy")}</Link></li>
          </ul>
        </nav>
        <p>{t("footer.issuer")}</p>
        <p>{t("footer.attestation")}</p>
      </footer>
      {full && user && <Tour role={role} />}
    </>
  );
}
