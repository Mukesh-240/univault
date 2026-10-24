/**
 * I18N (server side) — which language did the person choose? Read from a small cookie set by the
 * language switch. On a first visit (no cookie yet) the browser's own language decides: Telugu if it
 * starts with "te", otherwise English. Server pages call getI18n() and get the language plus a ready-made t().
 */
import { cookies, headers } from "next/headers";
import { isLang, LANG_COOKIE, preferredLang, translate, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : preferredLang((await headers()).get("accept-language"));
}

export async function getI18n(): Promise<{ lang: Lang; t: (key: string, vars?: Record<string, string | number>) => string }> {
  const lang = await getLang();
  return { lang, t: (key, vars) => translate(lang, key, vars) };
}
