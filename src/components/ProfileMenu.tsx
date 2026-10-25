"use client";
/**
 * AVATAR MENU — the round initials badge at the right of the top bar (named "Profile" for screen readers). It holds
 * everything that is not a page: who is signed in (name, role, UV-ID, the MASKED demo number only), the language on
 * phones, Text size and High contrast, Help for this screen, the first-run tour, "What UNIVAULT can do", the demo
 * guide, Switch role (back to the role list) and Sign out. Sign out removes the session cookie on the server.
 */
import { ArrowLeftRight, Compass, LayoutGrid, LogOut, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { TextSize } from "@/lib/prefs";
import type { Role } from "@/lib/session";
import { post } from "./api";
import { DisplayControls } from "./DisplayMenu";
import { HelpPanel } from "./HelpPanel";
import { useI18n } from "./I18n";
import { LangSwitch } from "./LangSwitch";
import { Popover } from "./Popover";
import { openTour } from "./Tour";

export interface ProfileProps { name: string | null; last4: string; role: Role; uvId: string; size: TextSize; contrast: "high" | "normal" }

export function ProfileMenu(p: ProfileProps) {
  const { t } = useI18n();
  const initials = (p.name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <Popover className="tool-profile" label={<><span className="avatar avatar-s" aria-hidden="true">{initials || "?"}</span><span className="sr-only">{t("ui.profile")}</span></>} panelLabel={t("ui.profile")}>
      <ProfileDetails {...p} />
    </Popover>
  );
}

export function ProfileDetails({ name, last4, role, uvId, size, contrast }: ProfileProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await post("/api/auth/signout", {});
    window.location.assign("/signin");
  };
  return (
    <div className="avatar-menu">
      <h2>{name ?? t("ui.profile")}</h2>
      <p className="meta"><span className="chip role-chip">{t(`signin.role.${role}.tag`)}</span> <span className="tabular">{t("acct.uvid", { id: uvId })}</span></p>
      <p className="meta">{t("ui.signedInWith", { id: `XXXX XXXX ${last4}` })} · {t("ui.simulatedSignIn")}</p>
      <div className="menu-lang"><LangSwitch /></div>
      <DisplayControls initialSize={size} initialContrast={contrast} />
      <ul className="menu-links">
        <li><HelpPanel inMenu /></li>
        {role === "sender" && <li><button type="button" className="text" onClick={openTour}><PlayCircle size={18} aria-hidden="true" /> {t("tour.reopen")}</button></li>}
        <li><Link prefetch={false} href="/features"><LayoutGrid size={18} aria-hidden="true" /> {t("features.link")}</Link></li>
        <li><Link prefetch={false} href="/demo"><Compass size={18} aria-hidden="true" /> {t("demo.link")}</Link></li>
        {role === "sender" && <li><Link prefetch={false} href="/ledger">{t("nav2.proof")}</Link></li>}
        {role === "sender" && <li><Link prefetch={false} href="/receive">{t("mode.toReceiving")}</Link></li>}
      </ul>
      <div className="row">
        <button type="button" className="secondary" onClick={signOut} disabled={busy}><ArrowLeftRight size={18} aria-hidden="true" /> {t("menu.switchRole")}</button>
        <button type="button" className="secondary" onClick={signOut} disabled={busy}><LogOut size={18} aria-hidden="true" /> {t("ui.signOut")}</button>
      </div>
    </div>
  );
}
