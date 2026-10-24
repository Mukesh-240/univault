/**
 * WATERMARK — the faint diagonal text printed across a shared document.
 *
 * Plain-English picture:
 *   When a recipient opens a shared document, the page is covered with faint, slanted, repeating
 *   text: "recipient name · recipient code · time · session code". If a screenshot later leaks,
 *   the owner can read that text off the image and type it into the leak-trace tool, which finds
 *   exactly which recipient and which viewing session it came from.
 *
 *   Honest limit: a watermark TRACES a leak; it cannot stop someone taking a screenshot, and it can
 *   be cropped out.
 */

/** The four pieces of information stamped on the page. */
export interface WatermarkInfo { name: string; recipientCode: string; time: string; session: string }

// Make text safe to place inside the picture (so a name like "<b>" can't break the page).
const esc =(s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** The watermark sentence, e.g. "<recipient name> · UV-R-1042 · <date> <time> · K7Q2ZP". */
export function watermarkLabel(w: WatermarkInfo): string {
  return `${w.name} · ${w.recipientCode} · ${w.time} · ${w.session}`;
}

/**
 * Build the watermark as a small slanted picture (SVG) that the browser repeats across the page
 * as a background. `opacity` 0.09 = about 9% visible: readable on a screenshot, not distracting.
 */
export function watermarkBackground(w: WatermarkInfo, opacity = 0.09): string {
  const label = esc(watermarkLabel(w));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='220'><text x='0' y='120' font-family='Arial,sans-serif' font-size='13' fill='%231a1a1a' fill-opacity='${opacity}' transform='rotate(-28 180 110)'>${label}</text></svg>`
    .replace(/#/g, "%23");
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/%23/g, "#")).replace(/'/g, "%27")}")`;
}

/** Extract the visible watermark text for the leak-trace tool ("paste what the leaked image says"). */
export function parseWatermark(text: string): { recipientCode?: string; session?: string } {
  const code = text.match(/UV-R-\d+/i)?.[0]?.toUpperCase();
  // OCR of a screenshot may read the "·" separator as ".", "-" or "|".
  const session = text.match(/[\u00B7.|-]\s*([A-Z0-9]{6})\s*$/m)?.[1];
  return { recipientCode: code, session };
}
