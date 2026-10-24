/**
 * DISPLAY PREFERENCES — text size and high contrast, remembered per browser in two small cookies
 * (no personal data). The server reads them so the very first paint already has the right size.
 */
export const SIZE_COOKIE = "uv_size";
export const CONTRAST_COOKIE = "uv_contrast";
/** Text size as a percentage of the base size: A- (100), A (125), A+ (150). The base itself is 20px. */
export const SIZES = ["100", "125", "150"] as const;
export type TextSize = (typeof SIZES)[number];
export const DEFAULT_SIZE: TextSize = "100";

export const parseSize = (v: string | undefined): TextSize => (SIZES as readonly string[]).includes(v ?? "") ? (v as TextSize) : DEFAULT_SIZE;
export const parseContrast = (v: string | undefined): "high" | "normal" => (v === "high" ? "high" : "normal");
