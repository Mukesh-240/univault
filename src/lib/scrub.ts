/**
 * SCRUB — the one and only way the app writes log messages, with personal data blacked out.
 *
 * Plain-English picture:
 *   Programs write "logs" (a running diary of what happened) to help fix problems. Logs are often
 *   copied around and read by many people, so they must never contain personal data. Every log
 *   line in UNIVAULT goes through log() below, which first replaces anything that looks like an
 *   ID number, email, phone number, long secret code or a date with a [REDACTED-...] marker.
 *   Callers can also pass specific values to black out (e.g. the person's name).
 *
 *   findLeaks() is used by the automated "zero sensitive values in logs and share links" test.
 */

// Each entry: a pattern of sensitive-looking text, and what to replace it with.
const PATTERNS: [RegExp, string][] = [
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[REDACTED-ID]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED-EMAIL]"],
  [/(\+?91[\s-]?)?[6-9]\d{9}\b/g, "[REDACTED-PHONE]"],
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[REDACTED-TOKEN]"],
  [/\b(19|20)\d{2}-\d{2}-\d{2}\b/g, "[REDACTED-DATE]"],
  [/\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)\d{2}\b/g, "[REDACTED-DATE]"],
  [/\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(19|20)\d{2}\b/gi, "[REDACTED-DATE]"],
];

/** Return a copy of the text with sensitive values replaced by [REDACTED...] markers. */
export function redact(s: string, extra: string[] = []): string {
  let out = s;
  // Longest first, so a value that contains another is removed whole.
  for (const v of [...extra].sort((a, b) => b.length - a.length)) if (v) out = out.split(v).join("[REDACTED]");
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

/** The last 500 log lines, kept in memory so the leak test can inspect them. */
export const logBuffer: string[] = [];

/**
 * Write one log line (after redaction). `data` is any extra detail; `extra` lists values that must
 * also be blacked out. In tests nothing is printed to the screen; lines are only buffered.
 */
export function log(level: "info" | "warn" | "error", msg: string, data?: unknown, extra: string[] = []): void {
  const line = redact(`${level} ${msg} ${data === undefined ? "" : JSON.stringify(data)}`, extra);
  logBuffer.push(line);
  if (logBuffer.length > 500) logBuffer.shift();
  if (typeof console !== "undefined" && process.env.NODE_ENV !== "test") console[level](line);
}

/** Returns every sensitive value that appears in any text. Test passes when this is empty. */
export function findLeaks(texts: string[], sensitive: string[]): string[] {
  const found = new Set<string>();
  for (const t of texts) for (const v of sensitive) if (v && t.includes(v)) found.add(v);
  return [...found];
}
