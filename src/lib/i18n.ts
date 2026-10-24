/**
 * I18N — English and Telugu text for the screens (safe to use in the browser and on the server).
 *
 * Plain-English picture:
 *   Every word on screen comes from a locale file: src/locales/en.json and src/locales/te.json
 *   (same keys, different language). translate("vault.title") picks the right one.
 *   A missing Telugu line falls back to English, so the screen never shows a raw key.
 *
 *   The engines explain their decisions in English sentences built at run time ("Expired 9 days ago
 *   (valid until YYYY-MM-DD)."). localizeReason() turns each known sentence shape into Telugu using
 *   src/locales/te-reasons.json. Any sentence it does not know stays in English and is marked
 *   lang="en", so a screen reader pronounces it correctly. This is presentation only: decisions are
 *   never made from translated text.
 */
import en from "../locales/en.json";
import te from "../locales/te.json";
import teReasons from "../locales/te-reasons.json";

export type Lang = "en" | "te";
export const LANGS: Lang[] = ["en", "te"];
export const LANG_COOKIE = "uv_lang";
export const isLang = (v: unknown): v is Lang => v === "en" || v === "te";

const DICTS: Record<Lang, Record<string, string>> = { en, te };

/** One screen string, with {placeholders} filled in. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : s;
}

/** A field name for people: "total_marks" -> "Total marks" (or its Telugu label when one exists). */
export function fieldLabel(lang: Lang, field: string): string {
  const key = `field.${field}`;
  const s = translate(lang, key);
  return s === key ? field.replace(/_/g, " ") : s;
}

/** Times are shown as "YYYY-MM-DD HH:MM UTC" (the server works in UTC). */
export const showTime = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** Does this text contain Telugu letters? (Used to mark it lang="te" for screen readers and the Telugu font.) */
export const hasTelugu = (s: string) => /[\u0C00-\u0C7F]/.test(s);

/** A piece of translated text and the language it ended up in. */
export interface Segment { text: string; lang: Lang }

const PATTERNS = teReasons.patterns.map((p) => ({ re: new RegExp(p.pattern), te: p.te }));

/** Translate one whole sentence if its shape is known; null if not. */
function sentence(s: string): string | null {
  for (const { re, te: tpl } of PATTERNS) {
    const m = s.match(re);
    if (!m) continue;
    return tpl
      .replace(/\$L(\d)/g, (_, i: string) => m[Number(i)].split("; ").map((part) => sentence(part) ?? part).join("; "))
      .replace(/\$R(\d)/g, (_, i: string) => localizeReason(m[Number(i)], "te").map((x) => x.text).join(" "))
      .replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? "");
  }
  return null;
}

/** An engine's English reason, in the chosen language, split into segments (untranslated ones stay English). */
export function localizeReason(text: string, lang: Lang): Segment[] {
  if (lang === "en" || !text) return [{ text, lang: "en" }];
  const whole = sentence(text);
  if (whole !== null) return [{ text: whole, lang: "te" }];
  // A bare "a; b; c" list (e.g. a name match's reasons): translate it item by item if every item is known.
  const items = text.split("; ").map(sentence);
  if (items.length > 1 && items.every((x) => x !== null)) return [{ text: items.join("; "), lang: "te" }];
  // Several sentences glued together: translate each one on its own.
  return text.split(/(?<=\.)\s+(?=[A-Z"])/).map((s) => {
    const t = sentence(s);
    return t === null ? { text: s, lang: "en" as const } : { text: t, lang: "te" as const };
  });
}
