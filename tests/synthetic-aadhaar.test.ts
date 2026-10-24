/**
 * SYNTHETIC AADHAAR-STYLE NUMBER tests (src/lib/synthetic-aadhaar.ts). In plain words, these check that:
 *   - the check-digit method is the real Verhoeff one (the textbook example 236 -> 2363 passes);
 *   - every generated number starts with 0000, has 12 digits and passes;
 *   - changing any single digit, or swapping two neighbouring different digits, makes a number fail;
 *   - numbers starting 1-9 (or any non-0000 start) are refused as "not a demo number" — even before all
 *     12 digits are typed — so a real Aadhaar number can never be accepted;
 *   - format() groups in fours, and mask() shows only the last four digits.
 */
import { describe, expect, it } from "vitest";
import { checkDigit, digitsOnly, format, generate, isValid, mask, validate } from "../src/lib/synthetic-aadhaar";

/** 300 different valid demo numbers. */
const samples = Array.from({ length: 300 }, () => generate());

describe("Verhoeff check digit", () => {
  it("matches the published example (236 + check digit 3)", () => {
    expect(checkDigit("236")).toBe(3);
    expect(checkDigit("12345")).toBe(1); // "123451" is the other common textbook value
  });
});

describe("generate / isValid", () => {
  it("makes 12-digit numbers that start with 0000 and pass", () => {
    for (const n of samples) {
      expect(n).toMatch(/^0000\d{8}$/);
      expect(isValid(n)).toBe(true);
    }
  });

  it("makes different numbers each time", () => {
    expect(new Set(samples).size).toBeGreaterThan(290);
  });

  it("changing any one digit after the 0000 start makes it fail", () => {
    for (const n of samples.slice(0, 60)) {
      for (let pos = 4; pos < 12; pos++) {
        for (let d = 0; d <= 9; d++) {
          if (String(d) === n[pos]) continue;
          const bad = n.slice(0, pos) + d + n.slice(pos + 1);
          expect(isValid(bad), `${pos}:${d}`).toBe(false);
        }
      }
    }
  });

  it("swapping two neighbouring different digits makes it fail", () => {
    for (const n of samples) {
      for (let pos = 3; pos < 11; pos++) {
        if (n[pos] === n[pos + 1]) continue; // swapping equal digits changes nothing
        const bad = n.slice(0, pos) + n[pos + 1] + n[pos] + n.slice(pos + 2);
        expect(isValid(bad), `${n} swap ${pos}`).toBe(false);
      }
    }
  });
});

describe("only demo numbers are accepted", () => {
  it("refuses numbers starting 2-9 (and 1) as not-a-demo-number, even while typing", () => {
    for (const first of "123456789") {
      expect(validate(first)).toEqual({ ok: false, problem: "not_demo" });
      expect(validate(`${first}23456789012`)).toEqual({ ok: false, problem: "not_demo" });
    }
    expect(validate("0001")).toEqual({ ok: false, problem: "not_demo" });
    expect(validate("0010 2345 6789")).toEqual({ ok: false, problem: "not_demo" });
  });

  it("reports the other problems in plain categories", () => {
    expect(validate("")).toEqual({ ok: false, problem: "empty" });
    expect(validate("00")).toEqual({ ok: false, problem: "incomplete" });
    expect(validate("0000 1234")).toEqual({ ok: false, problem: "incomplete" });
    expect(validate("0000123456789")).toEqual({ ok: false, problem: "too_long" });
    expect(validate("abc")).toEqual({ ok: false, problem: "empty" });
  });

  it("accepts a valid number however it is typed or pasted", () => {
    const n = samples[0];
    expect(validate(format(n))).toEqual({ ok: true, digits: n });
    expect(validate(`${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}`)).toEqual({ ok: true, digits: n });
    expect(validate(` ${n} `)).toEqual({ ok: true, digits: n });
  });
});

describe("format / mask", () => {
  it("groups in fours while typing", () => {
    expect(format("0")).toBe("0");
    expect(format("00001")).toBe("0000 1");
    expect(format("000012345678")).toBe("0000 1234 5678");
    expect(format("0000 1234 5678 99")).toBe("0000 1234 5678");
    expect(digitsOnly("0000 1234-5678")).toBe("000012345678");
  });

  it("shows only the last four digits", () => {
    expect(mask("000012345678")).toBe("XXXX XXXX 5678");
    expect(mask("0000 1234 5678")).toBe("XXXX XXXX 5678");
    expect(mask("000012345678")).not.toContain("1234");
  });
});
