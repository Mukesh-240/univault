"use client";
/** CHROME — the frame around every page, different for each role (issuer, sender, receiver). */
import {
  Bell, ClipboardCheck, Ellipsis, FileCheck2, FilePlus2, History, House, Inbox, LayoutDashboard, PanelLeftClose, PanelLeftOpen,
  Search, Send, Share2, ShieldCheck, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Role } from "@/lib/session";
import type { TextSize } from "@/lib/prefs";
import { DemoChip } from "./DemoChip";
import { DisplayMenu } from "./DisplayMenu";
import { HelpPanel } from "./HelpPanel";
import { useI18n } from "./I18n";
import { LangSwitch } from "./LangSwitch";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";

export interface ChromeUser { name: string | null; last4: string; role: Role; uvId: string }

interface Item { href: string; tab: string; side: string; Icon: LucideIcon; here: (p: string) => boolean }
const MORE_PREFIXES = ["/more", "/ocr", "/names", "/verify", "/ledger", "/leak-trace", "/assistant", "/faults", "/threat-model", "/policy"];
const SENDER: Item[] = [
  { href: "/", tab: "nav.tab.home", side: "nav.side.home", Icon: House, here: (p) => p === "/" || p.startsWith("/doc/") || p.startsWith("/add") },
  { href: "/readiness", tab: "nav.tab.ready", side: "nav.side.ready", Icon: ClipboardCheck, here: (p) => p === "/readiness" },
  { href: "/shares", tab: "nav.tab.shares", side: "nav.side.shares", Icon: Share2, here: (p) => p.startsWith("/share") },
  { href: "/alerts", tab: "nav.tab.alerts", side: "nav.side.alerts", Icon: Bell, here: (p) => p === "/alerts" },
  { href: "/more", tab: "nav.tab.more", side: "nav.side.more", Icon: Ellipsis, here: (p) => MORE_PREFIXES.some((m) => p === m || p.startsWith(`${m}/`)) },
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
/** Also on the sender's side menu (wide screens); on phones they are on the More page. */
const SENDER_SECONDARY: [string, string][] = [
  ["/ocr", "nav.ocr"], ["/names", "nav.names"], ["/verify", "nav.verify"], ["/ledger", "nav.ledger"], ["/leak-trace", "nav.leak"],
  ["/assistant", "nav.assistant"], ["/faults", "nav.faults"], ["/threat-model", "footer.threatModel"], ["/policy", "footer.policy"],
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
  const [folded, setFolded] = useState(false);
  // The side menu remembers whether it was folded (a per-browser convenience; the page works without it).
  useEffect(() => { try { setFolded(localStorage.getItem("uv_fold") === "1"); } catch { /* storage blocked: stay open */ } }, []);
  const fold = () => setFolded((f) => { try { localStorage.setItem("uv_fold", f ? "0" : "1"); } catch { /* ignore */ } return !f; });
  const receiving = path.startsWith("/receive");

  return (
    <>
      <a href="#main" className="skip-link">{t("a11y.skip")}</a>
      <div className="top-stack">
      {/* The persistent synthetic strip (FINAL_FEATURES 0.1): on every page, calm, never dismissible. */}
      <p className="synthetic-strip" role="note">{t("strip.text")}{offline ? ` · ${t("banner.offlineStore")}` : ""}</p>
      <header className="topbar">
        <div className="topbar-inner">
          <Link prefetch={false} href={full ? HOMES[role] : "/signin"} className="brand"><Logo size={36} priority /> <span className="wordmark">UNIVAULT</span></Link>
          {full && (
            <form className="top-search" role="search" action={SEARCH[role]} method="get">
              <label htmlFor="top-q" className="sr-only">{t("ui.search")}</label>
              <Search size={20} aria-hidden="true" />
              <input id="top-q" name="q" type="search" autoComplete="off" placeholder={t("ui.search")} />
            </form>
          )}
          <div className="tools">
            {full && role === "sender" && (
              <nav className="mode-switch" aria-label={t("mode.label")}>
                <Link prefetch={false} href="/" aria-current={receiving ? undefined : "page"}>{t("mode.sending")}</Link>
                <Link prefetch={false} href="/receive" aria-current={receiving ? "page" : undefined}>{t("mode.receiving")}</Link>
              </nav>
            )}
            <LangSwitch />
            <DisplayMenu initialSize={size} initialContrast={contrast} />
            {full && user && role === "sender" && <NotificationBell />}
            <DemoChip offline={offline} />
            {full && user && <ProfileMenu name={user.name} last4={user.last4} role={role} uvId={user.uvId} />}
          </div>
        </div>
      </header>
      </div>
      <div className={`shell role-${role}${folded ? " folded" : ""}`}>
        {full && (
          <nav className="sidenav" aria-label={t("nav.label")}>
            <button type="button" className="fold-btn" onClick={fold} aria-pressed={folded}>
              {folded ? <PanelLeftOpen size={22} aria-hidden="true" /> : <PanelLeftClose size={22} aria-hidden="true" />}
              <span>{folded ? t("nav.unfold") : t("nav.fold")}</span>
            </button>
            <form className="side-search" role="search" action={SEARCH[role]} method="get">
              <label htmlFor="side-q" className="sr-only">{t("ui.search")}</label>
              <Search size={20} aria-hidden="true" />
              <input id="side-q" name="q" type="search" autoComplete="off" placeholder={t("ui.search")} />
            </form>
            <ul>
              {menu.map(({ href, side, Icon, here }) => (
                <li key={href}><Link prefetch={false} href={href} aria-current={here(path) ? "page" : undefined} title={t(side)}><Icon size={24} aria-hidden="true" /> <span>{t(side)}</span></Link></li>
              ))}
              {role === "sender" && (
                <li className="sub"><ul>
                  {SENDER_SECONDARY.map(([href, key]) => (
                    <li key={href}><Link prefetch={false} href={href} aria-current={path === href ? "page" : undefined}>{t(key)}</Link></li>
                  ))}
                </ul></li>
              )}
            </ul>
          </nav>
        )}
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
      {full && (
        <nav className="tabbar" aria-label={t("nav.label")}>
          {menu.map(({ href, tab, Icon, here }) => (
            <Link key={href} prefetch={false} href={href} aria-current={here(path) ? "page" : undefined}><Icon aria-hidden="true" />{t(tab)}</Link>
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
      <HelpPanel />
    </>
  );
}
