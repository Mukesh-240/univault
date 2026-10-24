"use client";
/**
 * LANGUAGE SWITCH — English / తెలుగు. Saves the choice in a small cookie (no personal data) and
 * re-renders the page in that language. Two real buttons with aria-pressed, so keyboard and screen
 * reader users know which one is on.
 */
import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import { useI18n } from "./I18n";

export function LangSwitch() {
  const { lang, t } = useI18n();
  const router = useRouter();
  const choose = (l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <div role="group" aria-label={t("lang.label")} className="lang-switch">
      <button type="button" aria-pressed={lang === "en"} onClick={() => choose("en")} lang="en">English</button>
      <button type="button" aria-pressed={lang === "te"} onClick={() => choose("te")} lang="te">తెలుగు</button>
    </div>
  );
}
