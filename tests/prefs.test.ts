/** TEXT SIZE COOKIE — the new A / A+ / A++ values, and old cookies moved over so a person who chose bigger text stays bigger. */
import { describe, expect, it } from "vitest";
import { parseSize } from "../src/lib/prefs";

describe("parseSize", () => {
  it("keeps the new values and defaults to 16px", () => {
    expect(["16", "18", "20"].map(parseSize)).toEqual(["16", "18", "20"]);
    expect(parseSize(undefined)).toBe("16");
    expect(parseSize("999")).toBe("16");
  });
  it("moves pre-Phase-10 cookies up the new scale (old 100/125/150 % of 20px)", () => {
    expect(["100", "125", "150"].map(parseSize)).toEqual(["16", "18", "20"]);
  });
});
