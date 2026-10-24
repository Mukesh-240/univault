"use client";
/**
 * I18N (browser side) — hands the chosen language to every interactive part of the page.
 * The server layout wraps the app in <I18nProvider lang=...>; components call useI18n() to get t().
 */
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { translate, type Lang } from "@/lib/i18n";

const Ctx = createContext<Lang>("en");

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

/** t() keeps the same identity until the language changes, so effects that depend on it don't re-run on
 *  every render (the notification bell used to re-fetch in a loop because of this). */
export function useI18n() {
  const lang = useContext(Ctx);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  return { lang, t };
}
