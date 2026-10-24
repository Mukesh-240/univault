/**
 * DISPLAY PREFERENCES — text size and high contrast, remembered per browser in two small cookies
 * (no personal data). The server reads them so the very first paint already has the right size.
 */
export const SIZE_COOKIE = "uv_size";
export const CONTRAST_COOKIE = "uv_contrast";
/** Text size in pixels: A (16, the default), A+ (18), A++ (20, which was the old default). */
export const SIZES = ["16", "18", "20"] as const;
export type TextSize = (typeof SIZES)[number];
export const DEFAULT_SIZE: TextSize = "16";
/** Cookies saved before Phase 10 used percentages of a 20px base. Someone who chose bigger text stays bigger:
 *  the old smallest (100% = 20px) becomes the new default, the old middle becomes A+, the old largest A++. */
const LEGACY: Record<string, TextSize> = { "100": "16", "125": "18", "150": "20" };

export const parseSize = (v: string | undefined): TextSize =>
  (SIZES as readonly string[]).includes(v ?? "") ? (v as TextSize) : LEGACY[v ?? ""] ?? DEFAULT_SIZE;
export const parseContrast = (v: string | undefined): "high" | "normal" => (v === "high" ? "high" : "normal");
