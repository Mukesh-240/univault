/**
 * DATES — reading dates written in different styles, and simple date arithmetic.
 *
 * Plain-English picture:
 *   The same date can be printed as 2003-05-14, 14-05-2003, 14/05/2003, "14 May 2003", or with
 *   Telugu digits. parseDate() turns any of these into one standard form (YYYY-MM-DD) so that two
 *   documents showing the same birthday in different styles are NOT reported as a mismatch.
 *   If a date can't be read with certainty, it returns null and the caller must say "unknown" —
 *   never guess.
 *
 * Conventions (also listed in the data card):
 *   - Numeric dates with the day first (DD-MM-YYYY) are read the Indian way: day, month, year.
 *   - A person born on 29 February reaches their birthday on 1 March in non-leap years.
 *   - "Today" is the calendar date in India (Asia/Kolkata), because the demo runs there.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Replace Telugu digits (code points U+0C66 to U+0C6F) with ordinary 0-9. */
export function toAsciiDigits(s: string): string {
  return [...s].map((c) => {
    const cp = c.codePointAt(0)!;
    return cp >= 0x0c66 && cp <= 0x0c6f ? String(cp - 0x0c66) : c;
  }).join("");
}

/** Build "YYYY-MM-DD" only if the numbers form a real calendar date (no 31 February). */
function isoIfValid(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Read a date in any supported style; returns "YYYY-MM-DD", or null if it can't be read with certainty. */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = toAsciiDigits(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);                         // 2003-05-14
  if (m) return isoIfValid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);                  // 14-05-2003, 14/05/2003, 14.05.2003
  if (m) return isoIfValid(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);              // 14 May 2003
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return month ? isoIfValid(+m[3], month, +m[1]) : null;
  }
  return null;
}

/** Whole days from date a to date b (positive when b is later). Both "YYYY-MM-DD". */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Age in whole years on a given day (29 February birthdays count on 1 March in non-leap years). */
export function ageOn(dob: string, on: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  const [bMonth, bDay] = bm === 2 && bd === 29 && !isLeap(y) ? [3, 1] : [bm, bd];
  const hadBirthday = m > bMonth || (m === bMonth && d >= bDay);
  return y - by - (hadBirthday ? 0 : 1);
}

/** Today's date in India as "YYYY-MM-DD". */
export const todayIso = (now: Date = new Date()): string => now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
