import { describe, expect, it } from "vitest";
import { parseWatermark, watermarkBackground, watermarkLabel } from "../src/lib/watermark";

const w = { name: "Example Hiring Co.", recipientCode: "UV-R-1042", time: "2026-10-25 10:15", session: "K7Q2ZP" };

describe("watermark", () => {
  it("builds the label in order", () => {
    expect(watermarkLabel(w)).toBe("Example Hiring Co. · UV-R-1042 · 2026-10-25 10:15 · K7Q2ZP");
  });
  it("background is an SVG data URL with the label and opacity, HTML-escaped", () => {
    const bg = watermarkBackground({ ...w, name: "<b>&" }, 0.1);
    expect(bg.startsWith('url("data:image/svg+xml;utf8,')).toBe(true);
    const svg = decodeURIComponent(bg.slice('url("data:image/svg+xml;utf8,'.length, -2));
    expect(svg).toContain("&lt;b&gt;&amp;");
    expect(svg).toContain("fill-opacity='0.1'");
    expect(svg).toContain("UV-R-1042");
  });
  it("parses the label back (leak trace)", () => {
    expect(parseWatermark(watermarkLabel(w))).toEqual({ recipientCode: "UV-R-1042", session: "K7Q2ZP" });
  });
  it("tolerates OCR-style separators and case", () => {
    expect(parseWatermark("example hiring co. . uv-r-1042 - 2026-10-25 10:15 | K7Q2ZP")).toEqual({ recipientCode: "UV-R-1042", session: "K7Q2ZP" });
  });
});
