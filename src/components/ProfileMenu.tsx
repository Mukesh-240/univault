"use client";
/**
 * PROFILE MENU — "Profile" in the top bar: who is signed in (name from the vault's identity card and the
 * MASKED demo number: only the last four digits are ever known to the browser) and a "Sign out" button.
 * Sign out removes the session cookie on the server, then returns to the sign-in page.
 */
import { LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { post } from "./api";
import { useI18n } from "./I18n";
import { Popover } from "./Popover";

export function ProfileMenu({ name, last4 }: { name: string | null; last4: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await post("/api/auth/signout", {});
    window.location.assign("/signin");
  };
  return (
    <Popover label={<><UserRound size={22} aria-hidden="true" /> {t("ui.profile")}</>} panelLabel={t("ui.profile")}>
      <h2>{name ?? t("ui.profile")}</h2>
      <p className="meta">{t("ui.signedInWith", { id: `XXXX XXXX ${last4}` })}</p>
      <p className="meta">{t("ui.simulatedSignIn")}</p>
      <button type="button" className="secondary" onClick={signOut} disabled={busy}><LogOut size={20} aria-hidden="true" /> {t("ui.signOut")}</button>
    </Popover>
  );
}
