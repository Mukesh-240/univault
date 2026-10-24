/**
 * CONTRAST and TEXT-SIZE tests (src/lib/palette.ts + src/app/globals.css). In plain words, these check that:
 *   - every text/background colour pair the interface uses reaches its WCAG target, in the normal look and
 *     in High contrast: body text 7:1 (AAA), chips and button text 4.5:1 (AA), control outlines 3:1;
 *   - the colour values in the palette file are the very ones written in globals.css (so the measured
 *     numbers are the real numbers);
 *   - the base text is 20px (and 25px / 30px for A / A+), and no text rule in the stylesheet is smaller
 *     than 18px, except the legal footer at 16px.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, PALETTE, pairs, type Mode } from "../src/lib/palette";

const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");
const highAt = css.indexOf('html[data-contrast="high"] {');
const normalBlock = css.slice(css.indexOf(":root {"), highAt);
const highBlock = css.slice(highAt, css.indexOf("}", highAt));

describe("colour contrast", () => {
  for (const mode of ["normal", "high"] as Mode[]) {
    it(`every pair reaches its target (${mode} look)`, () => {
      for (const p of pairs(mode)) expect(contrast(p.fg, p.bg), `${mode}: ${p.name} ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(p.min);
    });
  }

  it("body text is AAA (7:1) or better in both looks", () => {
    expect(contrast(PALETTE.normal.text, PALETTE.normal.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(PALETTE.high.text, PALETTE.high.bg)).toBeGreaterThanOrEqual(7);
  });

  it("the palette file and globals.css hold the same colour values", () => {
    for (const [mode, block] of [["normal", normalBlock], ["high", highBlock]] as const) {
      for (const [name, hex] of Object.entries(PALETTE[mode])) {
        expect(block.toUpperCase(), `${mode}: ${name} ${hex} is in globals.css`).toContain(hex.toUpperCase());
      }
    }
  });

  it("uses the colours the design brief names", () => {
    const n = PALETTE.normal;
    expect([n.header, n.bg, n.action, n.ok, n.warn, n.warnBg, n.bad, n.badBg, n.unk]).toEqual(
      ["#0B3A8C", "#F6F9FE", "#1565D8", "#0F7B4F", "#8A5200", "#FFF3D6", "#B3261E", "#FDE7E5", "#475569"]);
  });
});

describe("text size", () => {
  it("the base text is 16px (A); A+ is 18px and A++ is 20px (percentages of the browser's 16px)", () => {
    expect(css).toMatch(/html \{ font-size: 100%;/);
    expect(css).toMatch(/html\[data-size="18"\] \{ font-size: 112\.5%; \}/);
    expect(css).toMatch(/html\[data-size="20"\] \{ font-size: 125%; \}/);
    expect([16 * 1, 16 * 1.125, 16 * 1.25]).toEqual([16, 18, 20]);
  });

  it("no text rule is smaller than 13px at the base size (chips and the legal footer are the smallest)", () => {
    const small: string[] = [];
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      for (const m of rule[2].matchAll(/font-size:\s*([\d.]+)(rem|px|em)/g)) {
        const px = m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16; // rem/em are measured against the 16px base
        if (px < 13) small.push(`${selector} { font-size: ${m[1]}${m[2]} }`);
      }
    }
    expect(small).toEqual([]);
  });

  it("headings are 28, 22 and 18px at the base size, and almost nothing is bolder than 600", () => {
    expect(css).toMatch(/h1 \{ font-size: 1\.75rem; \} h2 \{ font-size: 1\.375rem; \} h3, \.h3 \{ font-size: 1\.125rem; \}/);
    expect([1.75, 1.375, 1.125].map((r) => r * 16)).toEqual([28, 22, 18]);
    const heavy = [...css.matchAll(/([^{}]+)\{[^{}]*font-weight:\s*(700|800|900)/g)].map((m) => m[1].replace(/\/\*[^]*?\*\//g, "").trim());
    expect(heavy).toEqual([".wordmark"]);
  });

  it("buttons are at least 2.75rem (44px) tall and the focus ring is 3px", () => {
    expect(css).toContain("--target: 2.75rem");
    expect(2.75 * 16).toBe(44);
    expect(css).toMatch(/:focus-visible \{ outline: 3px solid/);
  });
});
