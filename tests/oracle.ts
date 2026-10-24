/**
 * ORACLE — a deliberately simple, separately written reference for the rule semantics (spec 16.4).
 *
 * Plain-English picture:
 *   To catch mistakes in the real engine, we wrote a second, much plainer version of the same rules,
 *   WITHOUT looking at or importing the engine's code: reading dates, computing age, deciding
 *   expiry, combining pass/fail/unknown, and splitting Latin names into words. The differential test
 *   runs both on every generated case; any disagreement is a bug in one of them and must be explained.
 *
 *   Nothing here imports from src/. Keep it boring and obviously right.
 */

const TELUGU_DIGITS = "౦౧౨౩౪౫౬౭౮౯";
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function realDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const daysInMonth = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (d > daysInMonth) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Oracle date reader: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, "D Month YYYY", Telugu digits. */
export function oracleParseDate(raw: string): string | null {
  let s = "";
  for (const ch of raw.trim()) { const i = TELUGU_DIGITS.indexOf(ch); s += i >= 0 ? String(i) : ch; }
  const parts = s.split(/[-/.\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts;
  if (/^\d{4}$/.test(a) && /^\d{2}$/.test(b) && /^\d{2}$/.test(c) && s.includes("-")) return realDate(+a, +b, +c);
  if (/^\d{1,2}$/.test(a) && /^\d{1,2}$/.test(b) && /^\d{4}$/.test(c)) return realDate(+c, +b, +a);
  if (/^\d{1,2}$/.test(a) && /^[A-Za-z]+$/.test(b) && /^\d{4}$/.test(c)) {
    const m = MONTH_NAMES.indexOf(b.slice(0, 3).toLowerCase());
    return m >= 0 ? realDate(+c, m + 1, +a) : null;
  }
  return null;
}

/** Oracle age: compare "month-day" numbers; 29 Feb counts as 1 Mar in non-leap years. */
export function oracleAge(dob: string, on: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const birthday = bm === 2 && bd === 29 && !leap ? 301 : bm * 100 + bd;
  return y - by - (m * 100 + d < birthday ? 1 : 0);
}

/** Days from a to b using whole-day UTC timestamps. */
export function oracleDays(a: string, b: string): number {
  const t = (x: string) => { const [y, m, d] = x.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86_400_000; };
  return t(b) - t(a);
}

/** Oracle expiry: issued after today -> fail; past valid_until -> fail with days; else pass; unreadable -> unknown. */
export function oracleExpiry(validUntil: string | undefined, issuedOn: string | undefined, today: string): { status: "pass" | "fail" | "unknown"; days?: number } {
  if (validUntil === undefined) return { status: "pass" };
  const u = oracleParseDate(validUntil);
  if (!u) return { status: "unknown" };
  const i = issuedOn === undefined ? null : oracleParseDate(issuedOn);
  if (i && oracleDays(today, i) > 0) return { status: "fail" };
  const late = oracleDays(u, today);
  return late > 0 ? { status: "fail", days: late } : { status: "pass" };
}

/** Oracle three-valued AND. */
export function oracleCombine(xs: ("pass" | "fail" | "unknown")[]): "pass" | "fail" | "unknown" {
  let sawUnknown = false;
  for (const x of xs) { if (x === "fail") return "fail"; if (x === "unknown") sawUnknown = true; }
  return sawUnknown ? "unknown" : "pass";
}

const TITLES = ["mr", "mrs", "ms", "miss", "dr", "shri", "sri", "smt", "kumari", "km", "late", "prof", "sh", "kum"];

/** Oracle Latin name words: strip accents, lower-case, hyphens/dots become breaks, titles removed. */
export function oracleNameWords(name: string): string[] {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z]+/).filter((w) => w && !TITLES.includes(w));
}
