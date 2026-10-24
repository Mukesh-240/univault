/**
 * METAMORPHIC TESTS (spec 16.4) — the strongest proof that nothing is hardcoded.
 * In plain words: we change the data in ways that should NOT change the answers (rename everyone
 * consistently, move every date by the same number of days, shuffle the order, flip the synthetic
 * flag, use a different seed) and check the answers stay the same; and we change it in ways that
 * MUST change the answer (move an expiry date across today, alter one digit) and check it changes
 * exactly as expected.
 */
import { describe, expect, it } from "vitest";
import { alarmsFor, byDimension, makeBench, runAll, verifyDoc, type CaseResult } from "../eval/harness";
import { dobConsistency, findDuplicates } from "../src/lib/duplicates";
import { candidatePairs } from "../src/lib/resolution";
import { loadPacks, notExpiredFor } from "../src/lib/rules";
import { contextFor } from "../src/lib/vault";
import bank from "../synthetic/name-bank.json";
import { generate, type Dataset } from "../synthetic/generate";
import { oracleParseDate } from "./oracle";

const TODAY = "2026-10-25";
const packs = loadPacks();
const dev = generate({ seed: 7, set: "dev", today: TODAY });
const baseline = runAll(makeBench(dev.dataset, dev.labels, packs));
const correctById = (rs: CaseResult[]) => new Map(rs.filter((r) => r.evaluated).map((r) => [r.case_id, r.correct]));
const accuracy = (rs: CaseResult[], dim: string) => { const m = byDimension(rs)[dim]; return m.correct / m.evaluated; };

/** Apply a text transformation to every string value in documents and in the issuer's records. */
function mapStrings(data: Dataset, f: (s: string) => string): Dataset {
  const fields = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  return {
    ...data,
    documents: data.documents.map((d) => ({ ...d, fields: fields(d.fields), body_text: d.body_text && f(d.body_text), hidden_text: d.hidden_text && f(d.hidden_text) })),
    registry: data.registry.map((r) => ({ ...r, fields: fields(r.fields) })),
  };
}

describe("metamorphic relations", () => {
  it("renaming every person consistently leaves every category's accuracy unchanged", () => {
    // Rename at the source: the same seed, but every name part (Latin spelling, Telugu spelling,
    // variants, and therefore initials) is swapped for another bank entry. Some random draws depend on
    // name length, so cases are compared as categories, not one by one.
    const rotate = <T>(xs: T[]) => xs.map((_, i) => xs[(i + 7) % xs.length]);
    const renamedSet = generate({ seed: 7, set: "dev", today: TODAY, nameBank: { given: rotate(bank.given), surnames: rotate(bank.surnames) } });
    expect(renamedSet.dataset.documents[0].fields).not.toEqual(dev.dataset.documents[0].fields);
    const renamed = runAll(makeBench(renamedSet.dataset, renamedSet.labels, packs));
    for (const dim of ["dates", "tampering", "issuer_state", "duplicates", "injection", "over_broad"])
      expect(accuracy(renamed, dim), dim).toBe(accuracy(baseline, dim));
    // Matching (and anything that compares names or reads Telugu) depends on how each name transliterates: same accuracy within 5 points.
    for (const dim of ["names", "ocr", "negative_controls"])
      expect(Math.abs(accuracy(renamed, dim) - accuracy(baseline, dim)), dim).toBeLessThanOrEqual(0.05);
  });

  it("shifting every date (and today) by the same number of days changes no verdict", () => {
    const N = 37; // chosen so no shifted date crosses a 29 February
    const TE = "౦౧౨౩౪౫౬౭౮౯";
    const shiftIso = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + N)).toISOString().slice(0, 10); };
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const shift = (v: string): string => {
      const iso = oracleParseDate(v);
      if (!iso) return v;
      const [y, m, d] = shiftIso(iso).split("-");
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${y}-${m}-${d}`;
      if (/^\d{2}-\d{2}-\d{4}$/.test(v)) return `${d}-${m}-${y}`;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return `${d}/${m}/${y}`;
      if (/^\d{1,2} [A-Za-z]+ \d{4}$/.test(v)) return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
      return `${d}-${m}-${y}`.replace(/\d/g, (c) => TE[Number(c)]); // Telugu digits
    };
    const shifted = { ...mapStrings(dev.dataset, shift), meta: { ...dev.dataset.meta, reference_date: shiftIso(TODAY) } };
    const after = correctById(runAll(makeBench(shifted, dev.labels, packs)));
    const changed = [...correctById(baseline)].filter(([id, ok]) => after.get(id) !== ok && !id.startsWith("dates.leap_day_dob."));
    expect(changed).toEqual([]);
  });

  it("moving an expiry date across today flips the result exactly at the boundary", () => {
    const b = makeBench(dev.dataset, dev.labels, packs);
    const move = (level: string, days: number) => dev.labels.cases.filter((c) => c.level === level).map((c) => {
      const d = b.docs.get(c.refs[0])!;
      const until = oracleParseDate(d.fields.valid_until)!;
      const [y, m, dd] = until.split("-").map(Number);
      const moved = { ...d, fields: { ...d.fields, valid_until: new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10) } };
      return notExpiredFor(moved, contextFor([moved], b.today));
    });
    for (const o of move("expires_today", -1)) expect([o.status, o.detail?.daysExpired]).toEqual(["fail", 1]);
    for (const o of move("expired_1d", +1)) expect(o.status).toBe("pass");
  });

  it("reordering documents changes nothing", () => {
    const b = makeBench(dev.dataset, dev.labels, packs);
    for (const c of dev.labels.cases.filter((x) => x.refs.length > 1)) {
      const docs = c.refs.map((r) => b.docs.get(r)!), rev = [...docs].reverse();
      const pairs = (ds: typeof docs) => candidatePairs(ds).map((p) => `${[p.a, p.b].sort().join("|")}:${p.verdict}`).sort();
      expect(pairs(rev), c.case_id).toEqual(pairs(docs));
      expect(findDuplicates(rev).map((p) => p.kind).sort()).toEqual(findDuplicates(docs).map((p) => p.kind).sort());
      expect(dobConsistency(rev).consistent).toBe(dobConsistency(docs).consistent);
      expect(alarmsFor(rev, b).sort()).toEqual(alarmsFor(docs, b).sort());
    }
  });

  it("altering exactly one digit of a verified record names exactly that field", () => {
    const b = makeBench(dev.dataset, dev.labels, packs);
    const verified = dev.labels.cases.filter((c) => c.dimension === "tampering" && c.level === "none");
    expect(verified.length).toBeGreaterThanOrEqual(10);
    for (const c of verified) {
      const d = b.docs.get(c.refs[0])!;
      expect(verifyDoc(d, b.issuer, b.now).state).toBe("verified");
      const i = d.fields.cgpa.search(/\d/);
      const altered = { ...d, fields: { ...d.fields, cgpa: d.fields.cgpa.slice(0, i) + ((Number(d.fields.cgpa[i]) + 1) % 10) + d.fields.cgpa.slice(i + 1) } };
      const o = verifyDoc(altered, b.issuer, b.now);
      expect([o.state, o.mismatchedFields]).toEqual(["tamper_flagged", ["cgpa"]]);
    }
  });

  it("flipping the synthetic flag changes no decision at all", () => {
    const flipped = { ...dev.dataset, documents: dev.dataset.documents.map((d) => ({ ...d, synthetic: false as unknown as true, synthetic_origin: undefined as never })) };
    expect(JSON.stringify(runAll(makeBench(flipped, dev.labels, packs)))).toBe(JSON.stringify(baseline));
  });

  it("a different seed gives the same accuracy per category within 10 points", () => {
    const held = generate({ seed: 99, set: "heldout", today: TODAY });
    const other = runAll(makeBench(held.dataset, held.labels, packs));
    for (const dim of Object.keys(byDimension(baseline)).filter((d) => byDimension(baseline)[d].evaluated > 0))
      expect(Math.abs(accuracy(other, dim) - accuracy(baseline, dim)), dim).toBeLessThanOrEqual(0.1);
  });
});
