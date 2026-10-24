"use client";
/**
 * PROFILE MENU — "Profile" in the top bar: who is signed in (name from the vault's identity card and the
 * MASKED demo number: only the last four digits are ever known to the browser) and a "Sign out" button.
 * Sign out removes the session cookie on the server, then returns to the sign-in page.
 * In the header it is a round initials badge (the word "Profile" is kept for screen readers); on phones the same
 * details sit inside the one header menu (ProfileDetails).
 */
import { ArrowLeftRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { post } from "./api";
import { useI18n } from "./I18n";
import type { Role } from "@/lib/session";
import { Popover } from "./Popover";

export interface ProfileProps { name: string | null; last4: string; role: Role; uvId: string }

export function ProfileMenu(p: ProfileProps) {
  const { t } = useI18n();
  const initials = (p.name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <Popover className="tool-profile" label={<><span className="avatar avatar-s" aria-hidden="true">{initials || "?"}</span><span className="sr-only">{t("ui.profile")}</span></>} panelLabel={t("ui.profile")}>
      <ProfileDetails {...p} />
    </Popover>
  );
}

export function ProfileDetails({ name, last4, role, uvId }: ProfileProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await post("/api/auth/signout", {});
    window.location.assign("/signin");
  };
  return (
    <>
      <h2>{name ?? t("ui.profile")}</h2>
      <p><span className={`chip role-chip role-${role}`}>{t(`signin.role.${role}.tag`)}</span></p>
      <p className="meta tabular">{t("acct.uvid", { id: uvId })}</p>
      <p className="meta">{t("acct.uvidNote")}</p>
      <p className="meta">{t("ui.signedInWith", { id: `XXXX XXXX ${last4}` })}</p>
      <p className="meta">{t("ui.simulatedSignIn")}</p>
      {/* A sender can also receive: the switch lives here and on More, not in the top bar. */}
      {role === "sender" && <p><Link prefetch={false} href="/receive"><ArrowLeftRight size={16} aria-hidden="true" /> {t("mode.toReceiving")}</Link></p>}
      <button type="button" className="secondary" onClick={signOut} disabled={busy}><LogOut size={18} aria-hidden="true" /> {t("ui.signOut")}</button>
    </>
  );
}
