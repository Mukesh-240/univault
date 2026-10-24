"use client";
/**
 * I18N (browser side) — hands the chosen language to every interactive part of the page.
 * The server layout wraps the app in <I18nProvider lang=...>; components call useI18n() to get t().
 */
import { createContext, useContext, type ReactNode } from "react";
import { translate, type Lang } from "@/lib/i18n";

const Ctx = createContext<Lang>("en");

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const lang = useContext(Ctx);
  return { lang, t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars) };
}
