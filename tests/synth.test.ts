/**
 * Tests for the Synthetic Data Lab (spec section 16).
 * In plain words, these check that:
 *   - the same seed always produces the same data (and a different seed different data),
 *   - every dimension/level from the spec is covered at least 10 times, with >= 300 documents per set,
 *   - every generated document is accepted by the app's real upload checker (same front door),
 *   - the answers (labels) are kept out of the data,
 *   - the showcase has exactly the 17 planted conflicts + 3 negative controls,
 *   - no person name, serial, ID number or date from the dataset is written into the app's code.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentInput } from "../src/lib/ingest";
import { generate } from "../synthetic/generate";

const TODAY = "2026-10-25";
const dev = generate({ seed: 7, set: "dev", today: TODAY });
const heldout = generate({ seed: 99, set: "heldout", today: TODAY });
const show = generate({ seed: 2026, set: "showcase", today: TODAY });

// Every level named in spec section 16.3 (our names for them), per dimension.
const REQUIRED: Record<string, string[]> = {
  names: ["exact", "initials", "expanded", "reordered", "honorific", "hyphenated", "single_name", "very_long", "telugu_script", "mixed_script", "diacritics", "typo", "different_person_similar_name"],
  dates: ["expires_future", "expires_today", "expired_1d", "expired_9d", "expired_400d", "future_dated_issue", "leap_day_dob", "turns18_tomorrow", "turns18_today", "turns18_yesterday", "fmt_dmy", "fmt_iso", "fmt_long", "fmt_te_numerals"],
  tampering: ["none", "single_digit", "two_fields", "swapped_fields", "extra_field", "missing_field", "trailing_whitespace", "homoglyph", "whole_record_replaced"],
  ocr: ["clean", "mild_blur", "heavy_noise", "skew", "low_contrast", "mixed_script", "digit_confusion", "telugu_conjuncts"],
  issuer_state: ["active", "superseded", "revoked", "unreachable", "stale", "forged_signature", "unknown_serial", "version_bump_after_share"],
  duplicates: ["exact", "near", "rescan", "same_serial_different_content"],
  injection: ["visible_instruction", "zero_width", "hidden_text", "multilingual", "benign_assistant"],
  over_broad: ["none", "one_extra_field", "many_extra_fields", "full_id_instead_of_last4", "purpose_mismatch"],
  sharing: ["expiry_now", "expiry_30d", "expiry_past", "view_only", "download", "max_views", "wrong_recipient_id", "reused_otp", "killed_link", "two_devices", "revoked_then_reshared"],
  negative_controls: ["clean", "near_miss"],
};

describe("determinism", () => {
  it("same seed + same date gives identical output", () => {
    expect(JSON.stringify(generate({ seed: 7, set: "dev", today: TODAY }))).toBe(JSON.stringify(dev));
  });
  it("a different seed gives different people", () => {
    expect(heldout.dataset.documents[0].fields).not.toEqual(dev.dataset.documents[0].fields);
  });
});

describe("coverage", () => {
  for (const g of [dev, heldout]) {
    it(`${g.dataset.meta.set}: >= 300 documents and >= 10 cases for every required level`, () => {
      expect(g.dataset.documents.length).toBeGreaterThanOrEqual(300);
      for (const [dim, levels] of Object.entries(REQUIRED))
        for (const level of levels) expect(g.coverage[dim]?.[level] ?? 0, `${dim}/${level}`).toBeGreaterThanOrEqual(10);
    });
  }
  it("contains negative cases (expected: no alarm / not the same person / not flagged)", () => {
    const negatives = dev.labels.cases.filter((c) => c.expected.alarms === 0 || c.expected.same_person === false || c.expected.flagged === false);
    expect(negatives.length).toBeGreaterThanOrEqual(40);
  });
});

describe("data hygiene", () => {
  const all = [...dev.dataset.documents, ...heldout.dataset.documents, ...show.dataset.documents];
  it("every document passes the real upload checker (same front door as user uploads)", () => {
    for (const d of all) expect(() => DocumentInput.parse(d), d.ref).not.toThrow();
  });
  it("every document is marked synthetic with its origin", () => {
    for (const d of all) {
      expect(d.synthetic).toBe(true);
      expect(d.synthetic_origin).toMatchObject({ generator: expect.any(String), seed: expect.any(Number), recipe: expect.any(String) });
    }
  });
  it("ID numbers always start with 0000 (cannot be real)", () => {
    for (const d of all) if (d.fields.id_number) expect(d.fields.id_number.startsWith("0000")).toBe(true);
  });
  it("no document claims to be issuer-verified (tier is computed later)", () => {
    for (const d of all) expect(JSON.stringify(d)).not.toMatch(/issuer_verified/);
  });
  it("answers stay out of the data file", () => {
    const text = JSON.stringify(dev.dataset);
    for (const key of ['"expected"', '"misread_fields"', '"ground_truth"', '"same_person"', '"conflicts"']) expect(text).not.toContain(key);
  });
  it("registry has one entry per serial+version (matches the database's unique index)", () => {
    for (const g of [dev, heldout, show]) {
      const keys = g.dataset.registry.map((r) => `${r.serial}#${r.version}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("showcase (graduate_demo)", () => {
  const refs = new Set([...show.dataset.documents.map((d) => d.ref), ...show.dataset.requests.map((r) => r.ref), ...show.dataset.scenarios.map((s) => s.ref)]);
  it("has the 17 planted conflicts with ids 1..17, each pointing at real items", () => {
    expect(show.labels.conflicts!.map((c) => c.id)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    for (const c of show.labels.conflicts!) for (const r of c.refs) expect(refs.has(r), `${c.id} -> ${r}`).toBe(true);
  });
  it("has 3 negative controls, ~8 problem documents + 3 clean ones", () => {
    expect(show.labels.negatives).toHaveLength(3);
    expect(show.dataset.documents).toHaveLength(11);
  });
  it("income certificate expired exactly 9 days before the reference date", () => {
    const inc = show.dataset.documents.find((d) => d.doc_type === "income_certificate")!;
    expect(inc.fields.valid_until).toBe("2026-10-16");
  });
});

describe("no hardcoding: dataset values never appear in app code (src/)", () => {
  // Identifying values: full names, Telugu names, ID numbers, serials, reg/roll numbers, dates of birth and other dates.
  const SENSITIVE_KEYS = ["name", "name_te", "subject_name", "id_number", "serial", "reg_no", "roll_no", "dob", "valid_until", "issued_on", "address"];
  const values = new Set<string>();
  for (const g of [dev, heldout, show])
    for (const d of g.dataset.documents)
      for (const k of SENSITIVE_KEYS) { const v = d.fields[k]; if (v && v.length >= 6) values.add(v); }

  const files: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(join(__dirname, "..", "src"));

  it(`scans every source file for every dataset value: zero hits`, () => {
    const hits: string[] = [];
    // One documented exception: a rule pack's "lastReviewed" metadata date (required by the spec) is a
    // plain calendar date that can coincide with some generated date by chance. Only that line is skipped.
    const strip = (f: string, t: string) => (f.endsWith(".json") ? t.replace(/"lastReviewed":\s*"[^"]*"/g, "") : t);
    for (const f of files) { const text = strip(f, readFileSync(f, "utf8")); for (const v of values) if (text.includes(v)) hits.push(`${f}: ${v}`); }
    expect(values.size).toBeGreaterThan(1000);
    expect(hits).toEqual([]);
  });
});
