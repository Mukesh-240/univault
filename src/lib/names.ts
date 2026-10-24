/**
 * NAMES — "are these two names the same person?", with reasons a human can read.
 *
 * Plain-English picture:
 *   The same person's name is often written differently on different documents: initials instead
 *   of full names, surname first, a title like "Dr." in front, a spelling variant, or the whole
 *   name in Telugu script. This file:
 *     1. converts Telugu letters into Latin letters (transliteration),
 *     2. splits a name into lower-case words and drops titles (honorifics),
 *     3. turns each word into a rough "sounds-like" key so spelling variants match,
 *     4. pairs up the words of two names and scores how well they match (0 to 1),
 *     5. explains each pairing in plain words ("initial G could stand for ...").
 *
 *   It NEVER decides on its own that two documents belong to the same person. It only suggests;
 *   the person must click "confirm" (autoMerge is always false).
 */

// Lookup tables: Telugu character -> Latin letters.
// TE_VOWELS = stand-alone vowels; TE_SIGNS = vowel marks attached to a consonant; TE_CONS = consonants.

const TE_VOWELS: Record<string, string> = { "అ": "a", "ఆ": "aa", "ఇ": "i", "ఈ": "ii", "ఉ": "u", "ఊ": "uu", "ఋ": "ru", "ఎ": "e", "ఏ": "ee", "ఐ": "ai", "ఒ": "o", "ఓ": "oo", "ఔ": "au" };
const TE_SIGNS: Record<string, string> = { "ా": "aa", "ి": "i", "ీ": "ii", "ు": "u", "ూ": "uu", "ృ": "ru", "ె": "e", "ే": "ee", "ై": "ai", "ొ": "o", "ో": "oo", "ౌ": "au" };
const TE_CONS: Record<string, string> = { "క": "k", "ఖ": "kh", "గ": "g", "ఘ": "gh", "ఙ": "ng", "చ": "ch", "ఛ": "chh", "జ": "j", "ఝ": "jh", "ఞ": "ny", "ట": "t", "ఠ": "th", "డ": "d", "ఢ": "dh", "ణ": "n", "త": "t", "థ": "th", "ద": "d", "ధ": "dh", "న": "n", "ప": "p", "ఫ": "ph", "బ": "b", "భ": "bh", "మ": "m", "య": "y", "ర": "r", "ల": "l", "వ": "v", "శ": "sh", "ష": "sh", "స": "s", "హ": "h", "ళ": "l", "ఱ": "r" };
const VIRAMA = "\u0C4D";

export const hasTelugu = (s: string) => /[\u0C00-\u0C7F]/.test(s);

// The virama (U+0C4D) is the Telugu mark meaning "no vowel after this consonant".
// hasTelugu: true if the text contains any character from the Telugu block (U+0C00 to U+0C7F).

/**
 * Convert Telugu script to Latin letters, character by character.
 * A Telugu consonant carries a built-in "a" sound unless a vowel mark or a virama follows it.
 */
export function transliterateTelugu(input: string): string {
  const chars = [...input];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (TE_CONS[c]) {
      out += TE_CONS[c];
      const n = chars[i + 1];
      if (n === VIRAMA) { i++; continue; }
      if (n && TE_SIGNS[n]) { out += TE_SIGNS[n]; i++; continue; }
      out += "a";
    } else if (TE_VOWELS[c]) out += TE_VOWELS[c];
    else if (c === "ం") out += "m";
    else if (c === "ః") out += "h";
    else out += c;
  }
  return out;
}

// Titles that are not part of the name itself and are ignored when comparing.
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "shri", "sri", "smt", "kumari", "km", "late", "prof", "sh", "kum"]);

/**
 * Split a name into simple words: Telugu converted to Latin, accents removed (NFKD + dropping
 * combining marks U+0300..U+036F), lower-case, punctuation removed (a lone initial keeps its dot
 * stripped too: "G." -> "g"), and titles dropped.
 */
export function nameTokens(raw: string): string[] {
  const latin = hasTelugu(raw) ? transliterateTelugu(raw) : raw;
  return latin.normalize("NFKD").replace(/[\u0300-\u036F]/g, "").toLowerCase().replace(/[^a-z\s.]/g, " ")
    .split(/\s+/).map((t) => t.replace(/\./g, (m, o, s) => (s.length > 1 ? "" : m))).filter(Boolean)
    .filter((t) => !HONORIFICS.has(t.replace(/\.$/, "")));
}

/**
 * A rough "sounds-like" key, so common spelling and script variants land on the same key:
 * aspirated letters lose their "h" (th -> t, sh -> s), w -> v, c/q -> k, doubled letters collapse
 * (aa -> a), "ru" -> "ri", "ee" -> "i", "ayi" -> "ai", and a final "y" -> "i".
 */
export function phoneticKey(t: string): string {
  return t.toLowerCase().replace(/[^a-z]/g, "")
    .replace(/ayi/g, "ai").replace(/[bcdgkpst]h/g, (m) => m[0]).replace(/w/g, "v").replace(/[ckq]/g, "k").replace(/z/g, "j")
    .replace(/(.)\1+/g, "$1").replace(/ru/g, "ri").replace(/ee/g, "i").replace(/y$/g, "i");
}

/**
 * Jaro-Winkler similarity: a standard score from 0 (nothing alike) to 1 (identical) for two
 * short strings, which gives extra credit when the beginnings match. Used for near-miss spellings.
 */
function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const md = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - md); j < Math.min(b.length, i + md + 1); j++)
      if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let p = 0; while (p < 4 && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

/** The result of comparing two names. */
export interface NameMatch {
  score: number;          // 0..1, average quality of the word pairings
  verdict: "likely_same" | "possible" | "unlikely";
  explanations: string[];
  autoMerge: false;       // by design: a link needs explicit user confirmation
}

/**
 * Compare two names. For each word of name A, find the best unused word of name B:
 *   exact same word = 1.0; an initial that fits the start of a word = 0.6;
 *   same "sounds-like" key = 0.95; very similar spelling (>= 0.85) = 0.9 x similarity.
 * The score is the total divided by the average word count, so extra unmatched words lower it.
 * Verdict: >= 0.8 likely the same person; >= 0.55 possibly; otherwise unlikely.
 */
export function matchNames(rawA: string, rawB: string): NameMatch {
  const A = nameTokens(rawA), B = nameTokens(rawB);
  const explanations: string[] = [];
  // How well does word i of A fit word j of B? (similarity 0..1 plus the reason in words)
  const fit = (ta: string, tb: string): { sim: number; why: string } => {
    if (ta === tb) return { sim: 1, why: `"${ta}" matches exactly` };
    if (ta.length === 1 || tb.length === 1) {
      const [ini, full] = ta.length === 1 ? [ta, tb] : [tb, ta];
      return full.startsWith(ini) ? { sim: 0.6, why: `initial "${ini.toUpperCase()}" could stand for "${full}"` } : { sim: 0, why: "" };
    }
    if (phoneticKey(ta) === phoneticKey(tb)) return { sim: 0.95, why: `"${ta}" and "${tb}" sound the same (spelling or script variant)` };
    const jw = jaroWinkler(phoneticKey(ta), phoneticKey(tb));
    return jw >= 0.85 ? { sim: jw * 0.9, why: `"${ta}" is similar to "${tb}" (${jw.toFixed(2)})` } : { sim: 0, why: "" };
  };
  // Pair the STRONGEST fits first across all words (exact before sound-alike before initials), so the
  // result never depends on word order: e.g. in "<S>. <Given1> <Given2>" vs "<Given1> <Given2> <Surname>",
  // where Given2 and Surname start with the same letter S, the exact Given2 pair is made before the
  // initial "S" is considered, which then fits the surname.
  const candidates: { i: number; j: number; sim: number; why: string }[] = [];
  A.forEach((ta, i) => B.forEach((tb, j) => { const f = fit(ta, tb); if (f.sim > 0) candidates.push({ i, j, ...f }); }));
  candidates.sort((x, y) => y.sim - x.sim || x.i - y.i || x.j - y.j);
  const usedA = new Map<number, { sim: number; why: string }>();
  const used = new Set<number>();
  for (const c of candidates) if (!usedA.has(c.i) && !used.has(c.j)) { usedA.set(c.i, c); used.add(c.j); }

  const unmatchedA: string[] = [];
  let sum = 0;
  A.forEach((ta, i) => {
    const m = usedA.get(i);
    if (m) { sum += m.sim; explanations.push(m.why); }
    else { explanations.push(`"${ta}" has no counterpart`); unmatchedA.push(ta); }
  });
  const unmatchedB = B.filter((_, j) => !used.has(j));
  unmatchedB.forEach((tb) => explanations.push(`"${tb}" only appears in one name`));
  const denom = (A.length + B.length) / 2 || 1;
  const score = Math.round((sum / denom) * 1000) / 1000;
  const sortedA = [...A].sort().join(), sortedB = [...B].sort().join();
  if (A.join() !== B.join() && sortedA === sortedB) explanations.push("same words in a different order");
  // A full name part on EACH side with no counterpart on the other (e.g. two different surnames)
  // contradicts rather than merely adds: treat as different people. A missing middle name or an
  // initial on one side only is not a contradiction. (Found while tuning on the DEV set.)
  const fullA = unmatchedA.filter((t) => t.length > 1), fullB = unmatchedB.filter((t) => t.length > 1);
  if (fullA.length && fullB.length) {
    explanations.push(`"${fullA.join(" ")}" and "${fullB.join(" ")}" are different name parts`);
    return { score, verdict: "unlikely", explanations, autoMerge: false };
  }
  return { score, verdict: score >= 0.8 ? "likely_same" : score >= 0.55 ? "possible" : "unlikely", explanations, autoMerge: false };
}
