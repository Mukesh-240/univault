/**
 * I18N (server side) — which language did the person choose? Read from a small cookie set by the
 * language switch. Server pages call getI18n() and get the language plus a ready-made t() function.
 */
import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, translate, type Lang } from "./i18n";

export async function getI18n(): Promise<{ lang: Lang; t: (key: string, vars?: Record<string, string | number>) => string }> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(v) ? v : "en";
  return { lang, t: (key, vars) => translate(lang, key, vars) };
}
