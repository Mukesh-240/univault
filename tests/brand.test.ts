/**
 * BRAND — the logo is the owner's artwork, not a drawing. Fails if a logo file is missing, is not a PNG of the right
 * size, has lost its transparent background, or if the old hand-drawn SVG logo comes back anywhere in the code.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const FILES: [string, number, number][] = [
  ["public/brand/logo-512.png", 512, 512], ["public/brand/logo-192.png", 192, 192], ["public/brand/logo-64.png", 64, 64],
  ["public/brand/logo-32.png", 32, 32], ["src/app/icon.png", 64, 64], ["src/app/apple-icon.png", 180, 180], ["public/brand/og.png", 1200, 630],
];

describe("brand files", () => {
  it("the owner's original is kept", () => expect(existsSync(join(ROOT, "public/brand/source/univault-logo.jpeg"))).toBe(true));
  for (const [file, w, h] of FILES) {
    it(`${file} is a ${w}x${h} PNG`, async () => {
      const m = await sharp(join(ROOT, file)).metadata();
      expect(m.format).toBe("png");
      expect([m.width, m.height]).toEqual([w, h]);
    });
  }
  it("the logo has a transparent background (corner clear, centre solid)", async () => {
    const { data, info } = await sharp(join(ROOT, "public/brand/logo-192.png")).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alpha(1, 1)).toBe(0);
    expect(alpha(96, 140)).toBe(255);
  });
});

describe("no drawn logo is left", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const src = walk(join(ROOT, "src")).filter((f) => /\.(tsx?|css)$/.test(f));
  it("no logo.svg or icon.svg file or reference", () => {
    expect(existsSync(join(ROOT, "public/brand/logo.svg"))).toBe(false);
    expect(existsSync(join(ROOT, "src/app/icon.svg"))).toBe(false);
    for (const f of src) expect(readFileSync(f, "utf8"), f).not.toMatch(/logo\.svg|icon\.svg/);
  });
  it("Logo.tsx renders the picture file, not SVG paths", () => {
    const logo = readFileSync(join(ROOT, "src/components/Logo.tsx"), "utf8");
    expect(logo).toMatch(/next\/image/);
    expect(logo).toMatch(/\/brand\/logo-/);
    expect(logo).not.toMatch(/<svg|<path/);
  });
});
