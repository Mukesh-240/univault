/**
 * SYNTHETIC AADHAAR-STYLE NUMBERS — demo numbers for the simulated sign-in. NOT real Aadhaar numbers.
 *
 * Plain-English picture:
 *   A real Aadhaar number has 12 digits, never starts with 0 or 1, and its last digit is a "check digit"
 *   worked out from the other eleven (the Verhoeff method), so a mistyped number can be caught.
 *   Our demo numbers copy the SHAPE (12 digits, Verhoeff check digit) but ALWAYS start with 0000.
 *   Because real numbers never start with 0, a demo number can never be someone's real number, and the
 *   sign-in refuses anything that does not start with 0000.
 *
 *   - generate()  makes a fresh valid demo number;
 *   - validate()  says why a typed number is not acceptable (in codes the screen turns into plain words);
 *   - isValid()   yes/no;
 *   - format()    "000012345678" -> "0000 1234 5678";
 *   - mask()      "000012345678" -> "XXXX XXXX 5678" (what is shown after sign-in; the full number is never kept).
 *   Works in the browser, on the server and in tests (it only uses the Web Crypto API, no Node-only code).
 */

/** Every demo number starts with these four digits. */
export const DEMO_PREFIX = "0000";
export const NUMBER_LENGTH = 12;

// The Verhoeff check-digit tables (published, public-domain algorithm).
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

const digitsOf = (s: string) => Array.from(s, Number);

/** The check digit to append to a string of digits. */
export function checkDigit(payload: string): number {
  let c = 0;
  digitsOf(payload).reverse().forEach((d, i) => { c = D[c][P[(i + 1) % 8][d]]; });
  return INV[c];
}

/** Does this digit string (check digit included) pass the Verhoeff test? */
function verhoeffOk(all: string): boolean {
  let c = 0;
  digitsOf(all).reverse().forEach((d, i) => { c = D[c][P[i % 8][d]]; });
  return c === 0;
}

/** Only the digits of whatever was typed or pasted ("0000 1234-5678" -> "000012345678"). */
export const digitsOnly = (s: string) => s.replace(/\D/g, "");

/** A random digit string of the given length, from the platform's secure random source. */
function randomDigits(n: number): string {
  let out = "";
  while (out.length < n) {
    const bytes = new Uint8Array(n * 2);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) if (out.length < n && b < 250) out += String(b % 10); // 250 is a multiple of 10: no bias
  }
  return out;
}

/** A fresh demo number: 0000 + 7 random digits + the Verhoeff check digit. `rand` can be replaced in tests. */
export function generate(rand: (n: number) => string = randomDigits): string {
  const payload = DEMO_PREFIX + rand(NUMBER_LENGTH - DEMO_PREFIX.length - 1);
  return payload + checkDigit(payload);
}

/** Why a number is not acceptable. `incomplete` just means "keep typing". */
export type Problem = "empty" | "not_demo" | "incomplete" | "too_long" | "bad_check";

/**
 * Check what was typed. Gives { ok: true, digits } or the first problem found. A number that already
 * cannot start with 0000 is reported as `not_demo` straight away, before all 12 digits are typed.
 */
export function validate(input: string): { ok: true; digits: string } | { ok: false; problem: Problem } {
  const d = digitsOnly(input);
  if (!d) return { ok: false, problem: "empty" };
  const head = d.slice(0, DEMO_PREFIX.length);
  if (!DEMO_PREFIX.startsWith(head)) return { ok: false, problem: "not_demo" };
  if (d.length > NUMBER_LENGTH) return { ok: false, problem: "too_long" };
  if (d.length < NUMBER_LENGTH) return { ok: false, problem: "incomplete" };
  return verhoeffOk(d) ? { ok: true, digits: d } : { ok: false, problem: "bad_check" };
}

export const isValid = (input: string) => validate(input).ok;

/** "000012345678" -> "0000 1234 5678" (groups of four; also works while typing). */
export const format = (input: string) => (digitsOnly(input).slice(0, NUMBER_LENGTH).match(/.{1,4}/g) ?? []).join(" ");

/** "000012345678" -> "XXXX XXXX 5678": only the last four digits are ever shown after sign-in. */
export function mask(input: string): string {
  const d = digitsOnly(input);
  return `XXXX XXXX ${d.slice(-4).padStart(4, "X")}`;
}
