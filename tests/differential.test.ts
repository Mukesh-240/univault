/**
 * DIFFERENTIAL TESTS — the real engine vs the independent oracle, on EVERY generated case.
 * In plain words: two separately written versions of the same rules must agree everywhere.
 * Any disagreement fails the test and is printed, so it can be investigated and explained
 * (never silenced). Recorded disagreements so far: none (see the eval report for the run).
 */
import { describe, expect, it } from "vitest";
import { makeBench } from "../eval/harness";
import { ageOn, daysBetween, parseDate } from "../src/lib/dates";
import { hasTelugu, nameTokens } from "../src/lib/names";
import { ageAtLeastFor, combineAll, loadPacks, notExpiredFor } from "../src/lib/rules";
import { contextFor } from "../src/lib/vault";
import { generate } from "../synthetic/generate";
import { oracleAge, oracleCombine, oracleDays, oracleExpiry, oracleNameWords, oracleParseDate } from "./oracle";

const TODAY = "2026-10-25";
const packs = loadPacks();
const sets = [generate({ seed: 7, set: "dev", today: TODAY }), generate({ seed: 99, set: "heldout", today: TODAY }), generate({ seed: 2026, set: "showcase", today: TODAY })];
const DATE_FIELDS = ["dob", "valid_until", "issued_on", "date"];

describe("engine vs oracle", () => {
  it("date reading agrees on every date field in every set", () => {
    const disagreements: string[] = [];
    let n = 0;
    for (const g of sets) for (const d of g.dataset.documents) for (const f of DATE_FIELDS) {
      const v = d.fields[f];
      if (!v) continue;
      n++;
      if (parseDate(v) !== oracleParseDate(v)) disagreements.push(`${d.ref} ${f}="${v}": engine ${parseDate(v)} vs oracle ${oracleParseDate(v)}`);
    }
    expect(n).toBeGreaterThan(1000);
    expect(disagreements).toEqual([]);
  });

  it("date arithmetic and age agree on a full span of dates (incl. leap years)", () => {
    const disagreements: string[] = [];
    for (let y = 1996; y <= 2012; y++) for (const md of ["01-01", "02-28", "02-29", "03-01", "10-25", "12-31"]) {
      const dob = parseDate(`${y}-${md}`);
      if (!dob) continue;
      for (const on of ["2024-02-28", "2024-02-29", "2025-02-28", "2025-03-01", "2026-10-25", "2026-10-24"]) {
        if (ageOn(dob, on) !== oracleAge(dob, on)) disagreements.push(`age ${dob} on ${on}`);
        if (daysBetween(dob, on) !== oracleDays(dob, on)) disagreements.push(`days ${dob}..${on}`);
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("expiry and age rules agree on every generated date case", () => {
    const disagreements: string[] = [];
    let n = 0;
    for (const g of sets) {
      const b = makeBench(g.dataset, g.labels, packs);
      for (const d of b.docs.values()) {
        const ctx = contextFor([d], b.today);
        if (d.fields.valid_until !== undefined) {
          n++;
          const e = notExpiredFor(d, ctx), o = oracleExpiry(d.fields.valid_until, d.fields.issued_on, b.today);
          if (e.status !== o.status || (o.days !== undefined && e.detail?.daysExpired !== o.days)) disagreements.push(`${d.id}: engine ${e.status}/${e.detail?.daysExpired} oracle ${o.status}/${o.days}`);
        }
        if (d.fields.dob !== undefined && d.capture === "digital") {
          n++;
          const e = ageAtLeastFor(d, ctx, 18);
          const dob = oracleParseDate(d.fields.dob);
          const o = dob === null ? "unknown" : oracleAge(dob, b.today) >= 18 ? "pass" : "fail";
          if (e.status !== o) disagreements.push(`${d.id}: age engine ${e.status} oracle ${o}`);
        }
      }
    }
    expect(n).toBeGreaterThan(500);
    expect(disagreements).toEqual([]);
  });

  it("three-valued combination agrees on every combination of up to 4 results", () => {
    const vals = ["pass", "fail", "unknown"] as const;
    const combos: (typeof vals[number])[][] = [[]];
    for (let len = 1; len <= 4; len++) for (const prefix of combos.filter((c) => c.length === len - 1)) for (const v of vals) combos.push([...prefix, v]);
    for (const c of combos) expect(combineAll(c), c.join(",")).toBe(oracleCombine(c));
  });

  it("Latin name words agree on every Latin name in every set", () => {
    const disagreements: string[] = [];
    for (const g of sets) for (const d of g.dataset.documents) for (const f of ["name", "subject_name"]) {
      const v = d.fields[f];
      if (!v || hasTelugu(v) || d.capture === "scan") continue;
      if (nameTokens(v).join(" ") !== oracleNameWords(v).join(" ")) disagreements.push(`"${v}": engine [${nameTokens(v)}] oracle [${oracleNameWords(v)}]`);
    }
    expect(disagreements).toEqual([]);
  });
});
