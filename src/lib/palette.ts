/**
 * PALETTE — the colours of the interface, written down once so a test can measure them.
 *
 * Plain-English picture:
 *   src/app/globals.css holds the real colours as CSS variables. This file lists the same hex values and
 *   the pairs that sit on top of each other (text on card, white on the blue header, red text on its pink
 *   chip...). tests/contrast.test.ts works out the contrast ratio of every pair with the WCAG formula and
 *   fails if one drops below its target, and also checks that globals.css really contains these hex values.
 *   Targets: body text 7:1 (WCAG AAA), other text 4.5:1 (AA), lines that mark a control 3:1.
 *   Two looks: "normal" and "high" (the High contrast switch: black on white, heavy borders).
 */

export type Mode = "normal" | "high";
export interface Pair { name: string; fg: string; bg: string; min: number }

export const PALETTE: Record<Mode, Record<string, string>> = {
  normal: {
    bg: "#F3F6FB", card: "#FFFFFF", text: "#0F172A", muted: "#334155", edge: "#64748B",
    header: "#1E3A8A", onHeader: "#FFFFFF", action: "#1D4ED8", onAction: "#FFFFFF", link: "#1E3A8A",
    ok: "#166534", okBg: "#DCFCE7", warn: "#92400E", warnBg: "#FEF3C7", bad: "#991B1B", badBg: "#FEE2E2", unk: "#475569", unkBg: "#F1F5F9",
  },
  high: {
    bg: "#FFFFFF", card: "#FFFFFF", text: "#000000", muted: "#1F2937", edge: "#000000",
    header: "#000000", onHeader: "#FFFFFF", action: "#0A1F8F", onAction: "#FFFFFF", link: "#0A1F8F",
    ok: "#0B3D1A", okBg: "#FFFFFF", warn: "#5C2300", warnBg: "#FFFFFF", bad: "#7A0A0A", badBg: "#FFFFFF", unk: "#1F2937", unkBg: "#FFFFFF",
  },
};

/** Every foreground/background pair the interface uses, with the ratio it must reach. */
export function pairs(mode: Mode): Pair[] {
  const c = PALETTE[mode];
  return [
    { name: "body text on page", fg: c.text, bg: c.bg, min: 7 },
    { name: "body text on card", fg: c.text, bg: c.card, min: 7 },
    { name: "secondary text on page", fg: c.muted, bg: c.bg, min: 7 },
    { name: "secondary text on card", fg: c.muted, bg: c.card, min: 7 },
    { name: "link on card", fg: c.link, bg: c.card, min: 7 },
    { name: "link on page", fg: c.link, bg: c.bg, min: 7 },
    { name: "white on blue header", fg: c.onHeader, bg: c.header, min: 7 },
    { name: "button text on action blue", fg: c.onAction, bg: c.action, min: 4.5 },
    { name: "verified chip", fg: c.ok, bg: c.okBg, min: 4.5 },
    { name: "attention chip", fg: c.warn, bg: c.warnBg, min: 4.5 },
    { name: "not accepted chip", fg: c.bad, bg: c.badBg, min: 4.5 },
    { name: "not checked chip", fg: c.unk, bg: c.unkBg, min: 4.5 },
    { name: "verified text on card", fg: c.ok, bg: c.card, min: 4.5 },
    { name: "control outline on card", fg: c.edge, bg: c.card, min: 3 },
    { name: "control outline on page", fg: c.edge, bg: c.bg, min: 3 },
    { name: "action blue on card (focus ring, outline button)", fg: c.action, bg: c.card, min: 4.5 },
  ];
}

const channel = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
/** WCAG contrast ratio of two "#RRGGBB" colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
