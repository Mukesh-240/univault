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
      ["#1E3A8A", "#F3F6FB", "#1D4ED8", "#166534", "#92400E", "#FEF3C7", "#991B1B", "#FEE2E2", "#475569"]);
  });
});

describe("text size", () => {
  it("the base text is 20px; A is 25px and A+ is 30px (percentages of the browser's 16px)", () => {
    expect(css).toMatch(/html \{ font-size: 125%;/);
    expect(css).toMatch(/html\[data-size="125"\] \{ font-size: 156\.25%; \}/);
    expect(css).toMatch(/html\[data-size="150"\] \{ font-size: 187\.5%; \}/);
    expect(16 * 1.25).toBe(20);
    expect(16 * 1.5625).toBe(25);
    expect(16 * 1.875).toBe(30);
  });

  it("no text rule is smaller than 18px (the legal footer is 16px)", () => {
    const small: string[] = [];
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      for (const m of rule[2].matchAll(/font-size:\s*([\d.]+)(rem|px|em)/g)) {
        const px = m[2] === "px" ? Number(m[1]) : Number(m[1]) * 20; // rem/em are measured against the 20px base
        if (px < 18 && !selector.includes("site-footer")) small.push(`${selector} { font-size: ${m[1]}${m[2]} }`);
      }
    }
    expect(small).toEqual([]);
  });

  it("the legal footer is exactly 16px at the base size", () => {
    expect(css).toMatch(/\.site-footer \{[^}]*font-size: 0\.8rem/);
    expect(0.8 * 20).toBe(16);
  });

  it("headings are 28 to 36px at the base size", () => {
    expect(css).toMatch(/h1 \{ font-size: 1\.8rem; \} h2 \{ font-size: 1\.6rem; \} h3, \.h3 \{ font-size: 1\.4rem; \}/);
    expect([1.8, 1.6, 1.4].map((r) => r * 20)).toEqual([36, 32, 28]);
  });

  it("buttons are at least 2.4rem (48px) tall and the focus ring is 3px", () => {
    expect(css).toContain("--target: 2.4rem");
    expect(2.4 * 20).toBe(48);
    expect(css).toMatch(/:focus-visible \{ outline: 3px solid/);
  });
});
