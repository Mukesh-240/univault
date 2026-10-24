"use client";
/**
 * CHROME — the frame around every page, different for each role (issuer, sender, receiver).
 *   Top bar (56px): logo and name on the left; on the right a search icon, the language toggle, text size (with its
 *   current value), the alerts bell with a count, "Need help?" and the profile badge. On phones the language, text
 *   size and profile fold into one "Menu" so the bar never overflows.
 *   Side menu (wide screens): at most six entries; everything else lives under More. Bottom tabs on phones.
 */
import {
  Activity, Bell, ClipboardCheck, Ellipsis, FileCheck2, FilePlus2, History, House, Inbox, LayoutDashboard, Menu,
  Search, Send, Share2, ShieldCheck, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Role } from "@/lib/session";
import type { TextSize } from "@/lib/prefs";
import { DisplayControls, DisplayMenu } from "./DisplayMenu";
import { HelpPanel } from "./HelpPanel";
import { useI18n } from "./I18n";
import { LangSwitch } from "./LangSwitch";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { Popover } from "./Popover";
import { ProfileDetails, ProfileMenu } from "./ProfileMenu";

export interface ChromeUser { name: string | null; last4: string; role: Role; uvId: string }

/** `tab: null` = side menu only (on phones it is reached from More, so the tab bar keeps five tabs). */
interface Item { href: string; tab: string | null; side: string; Icon: LucideIcon; here: (p: string) => boolean }
const ACTIVITY = ["/ledger", "/leak-trace"];
const MORE_PREFIXES = ["/more", "/ocr", "/names", "/verify", "/assistant", "/faults", "/threat-model", "/policy"];
const under = (p: string, list: string[]) => list.some((m) => p === m || p.startsWith(`${m}/`));
const SENDER: Item[] = [
  { href: "/", tab: "nav.tab.home", side: "nav.side.home", Icon: House, here: (p) => p === "/" || p.startsWith("/doc/") || p.startsWith("/add") },
  { href: "/readiness", tab: "nav.tab.ready", side: "nav.side.ready", Icon: ClipboardCheck, here: (p) => p === "/readiness" },
  { href: "/shares", tab: "nav.tab.shares", side: "nav.side.shares", Icon: Share2, here: (p) => p.startsWith("/share") },
  { href: "/alerts", tab: "nav.tab.alerts", side: "nav.side.alerts", Icon: Bell, here: (p) => p === "/alerts" },
  { href: "/ledger", tab: null, side: "nav.side.activity", Icon: Activity, here: (p) => under(p, ACTIVITY) },
  { href: "/more", tab: "nav.tab.more", side: "nav.side.more", Icon: Ellipsis, here: (p) => under(p, MORE_PREFIXES) },
];
const ISSUER: Item[] = [
  { href: "/issuer", tab: "nav.issuer.tab.home", side: "nav.issuer.side.home", Icon: LayoutDashboard, here: (p) => p === "/issuer" },
  { href: "/issuer/issue", tab: "nav.issuer.tab.issue", side: "nav.issuer.side.issue", Icon: FilePlus2, here: (p) => p.startsWith("/issuer/issue") },
  { href: "/issuer/issued", tab: "nav.issuer.tab.issued", side: "nav.issuer.side.issued", Icon: FileCheck2, here: (p) => p.startsWith("/issuer/issued") },
  { href: "/issuer/activity", tab: "nav.issuer.tab.activity", side: "nav.issuer.side.activity", Icon: History, here: (p) => p.startsWith("/issuer/activity") },
  { href: "/issuer/more", tab: "nav.tab.more", side: "nav.side.more", Icon: Ellipsis, here: (p) => p.startsWith("/issuer/more") },
];
const RECEIVER: Item[] = [
  { href: "/receive", tab: "nav.recv.tab.inbox", side: "nav.recv.side.inbox", Icon: Inbox, here: (p) => p === "/receive" || /^\/receive\/(?!ask|requests|more)/.test(p) },
  { href: "/receive/ask", tab: "nav.recv.tab.ask", side: "nav.recv.side.ask", Icon: Send, here: (p) => p.startsWith("/receive/ask") },
  { href: "/receive/requests", tab: "nav.recv.tab.requests", side: "nav.recv.side.requests", Icon: FileCheck2, here: (p) => p.startsWith("/receive/requests") },
  { href: "/policy", tab: "nav.recv.tab.policy", side: "footer.policy", Icon: ShieldCheck, here: (p) => p === "/policy" || p === "/threat-model" },
  { href: "/receive/more", tab: "nav.tab.more", side: "nav.side.more", Icon: Ellipsis, here: (p) => p.startsWith("/receive/more") },
];
const MENUS: Record<Role, Item[]> = { sender: SENDER, issuer: ISSUER, receiver: RECEIVER };
const HOMES: Record<Role, string> = { sender: "/", issuer: "/issuer", receiver: "/receive" };
const SEARCH: Record<Role, string> = { sender: "/", issuer: "/issuer/issued", receiver: "/receive" };

export function Chrome({ user, size, contrast, offline, children }: {
  user: ChromeUser | null; size: TextSize; contrast: "high" | "normal"; offline: boolean; children: ReactNode;
}) {
  const { t } = useI18n();
  const path = usePathname();
  const full = Boolean(user) && !path.startsWith("/signin");
  const role: Role = user?.role ?? "sender";
  const menu = MENUS[role];
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
            <DisplayMenu initialSize={size} initialContrast={contrast} />
            {full && user && role === "sender" && <NotificationBell />}
            <HelpPanel />
            {full && user && <ProfileMenu name={user.name} last4={user.last4} role={role} uvId={user.uvId} />}
            {/* Phones: language, text size and profile in one menu. */}
            <Popover className="tool-menu" label={<><Menu size={20} aria-hidden="true" /><span className="sr-only">{t("ui.menu")}</span></>} panelLabel={t("ui.menu")}>
              <LangSwitch />
              <DisplayControls initialSize={size} initialContrast={contrast} />
              {full && user && <div className="menu-profile"><ProfileDetails name={user.name} last4={user.last4} role={role} uvId={user.uvId} /></div>}
            </Popover>
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
    </>
  );
}
