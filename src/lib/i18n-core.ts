/**
 * I18N CORE — the small, dictionary-free helpers that the browser needs.
 * Plain English: the full word lists (en.json / te.json) are big. Pages that run in the browser must not
 * import them, or every visitor downloads both languages. The server sends only the chosen language's
 * list to the browser (see I18nProvider); this file holds only the pieces that need no list.
 */
export type Lang = "en" | "te";
export const LANGS: Lang[] = ["en", "te"];
export const LANG_COOKIE = "uv_lang";
export const isLang = (v: unknown): v is Lang => v === "en" || v === "te";

/** Telugu if the browser's first-choice language is Telugu ("te", "te-IN"), otherwise English. */
export function preferredLang(acceptLanguage: string | null | undefined): Lang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "te" || first.startsWith("te-") || first.startsWith("te;") ? "te" : "en";
}

/** Times are shown as "YYYY-MM-DD HH:MM UTC" (the server works in UTC). */
export const showTime = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** Does this text contain Telugu letters? (Used to mark it lang="te" for screen readers and the Telugu font.) */
export const hasTelugu = (s: string) => /[ఀ-౿]/.test(s);

type T = (key: string, vars?: Record<string, string | number>) => string;

/** Label helpers built on any translate function. A missing label falls back to a tidied version of the id. */
export function labelers(t: T) {
  const pick = (key: string, id: string) => { const s = t(key); return s === key ? id.replace(/_/g, " ") : s; };
  const fieldLabel = (field: string) => pick(`field.${field}`, field);
  const docTypeLabel = (type: string) => pick(`doctype.${type}`, type);
  const itemLabel = (item: string) => {
    const [type, field] = item.split(".");
    return field ? `${docTypeLabel(type)} · ${fieldLabel(field)}` : fieldLabel(type);
  };
  return { fieldLabel, docTypeLabel, itemLabel };
}
