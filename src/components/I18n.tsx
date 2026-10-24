"use client";
/**
 * I18N (browser side) — hands the chosen language to every interactive part of the page.
 * The server layout wraps the app in <I18nProvider lang=... dict=...> and sends ONLY the chosen language's
 * word list (not both), which keeps the first download small on slow phones. Components call useI18n()
 * to get t() and the label helpers.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { labelers, type Lang } from "@/lib/i18n-core";

type Dict = Record<string, string>;
const Ctx = createContext<{ lang: Lang; dict: Dict }>({ lang: "en", dict: {} });

export function I18nProvider({ lang, dict, children }: { lang: Lang; dict: Dict; children: ReactNode }) {
  const value = useMemo(() => ({ lang, dict }), [lang, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** t() keeps the same identity until the language changes, so effects that depend on it don't re-run on
 *  every render (the notification bell used to re-fetch in a loop because of this). */
export function useI18n() {
  const { lang, dict } = useContext(Ctx);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const s = dict[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : s;
  }, [dict]);
  const labels = useMemo(() => labelers(t), [t]);
  return { lang, t, ...labels };
}
