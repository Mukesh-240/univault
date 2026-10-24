import { describe, expect, it } from "vitest";
import { hasTelugu, matchNames, nameTokens, phoneticKey, transliterateTelugu } from "../src/lib/names";

// Generic fictional names only; none of these come from the generated dataset.
describe("Telugu transliteration", () => {
  it("detects Telugu script", () => {
    expect(hasTelugu("సాయి")).toBe(true);
    expect(hasTelugu("Sai")).toBe(false);
  });
  it("transliterates consonant + vowel sign, virama and inherent a", () => {
    expect(transliterateTelugu("సాయి")).toBe("saayi");               // సాయి
    expect(transliterateTelugu("కృష్ణ")).toBe("krushna");       // కృష్ణ
    expect(transliterateTelugu("రామ")).toBe("raama");                     // రామ
  });
  it("Telugu and Latin spellings share a phonetic key", () => {
    const [te] = nameTokens("కృష్ణ");
    expect(phoneticKey(te)).toBe(phoneticKey("krishna"));
    expect(phoneticKey("saayi")).toBe(phoneticKey("sai"));
  });
});

describe("matchNames", () => {
  const full = "Sai Krishna Gudipati";
  it("Telugu-script name matches its Latin form", () => {
    const te = "సాయి కృష్ణ గుడిపాటి"; // సాయి కృష్ణ గుడిపాటి
    const m = matchNames(full, te);
    expect(m.verdict).toBe("likely_same");
    expect(m.explanations.join(" ")).toMatch(/sound the same/);
  });
  it("initial expands with an explanation", () => {
    const m = matchNames("G. Sai Krishna", full);
    expect(["likely_same", "possible"]).toContain(m.verdict);
    expect(m.explanations).toContain('initial "G" could stand for "gudipati"');
  });
  it("ignores honorifics", () => {
    expect(nameTokens("Dr. Sai Krishna")).toEqual(["sai", "krishna"]);
    expect(matchNames("Shri Sai Krishna Gudipati", full).score).toBe(1);
  });
  it("detects word order differences", () => {
    const m = matchNames("Gudipati Sai Krishna", full);
    expect(m.verdict).toBe("likely_same");
    expect(m.explanations).toContain("same words in a different order");
  });
  it("different person is unlikely", () => {
    expect(matchNames("Ravi Teja Kondapalli", full).verdict).toBe("unlikely");
  });
  it("similar but different surname is not likely_same", () => {
    expect(matchNames("Sai Krishna Gopalam", full).verdict).not.toBe("likely_same");
  });
  it("never auto-merges, whatever the inputs", () => {
    for (const [a, b] of [[full, full], ["", ""], ["G", "G"], [full, "x"]]) expect(matchNames(a, b).autoMerge).toBe(false);
  });
  it("is symmetric in verdict", () => {
    expect(matchNames("G. Sai Krishna", full).verdict).toBe(matchNames(full, "G. Sai Krishna").verdict);
  });
});
