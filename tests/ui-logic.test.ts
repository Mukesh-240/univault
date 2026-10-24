/**
 * UI LOGIC tests (src/lib/ui-logic.ts). In plain words, these check that:
 *   - every engine verification state becomes one of the four everyday words, and a stale "verified"
 *     asks for attention instead of showing a green tick;
 *   - "3 hours ago" is worked out correctly at the edges (59 s, 60 s, 59 min, 24 h...);
 *   - every readiness rule that is not satisfied gets the right fixing button, and a satisfied one gets none;
 *   - the Home screen's two tabs split documents by what the issuer can be asked, and search and the
 *     status filter narrow the list (and never invent documents).
 */
import { describe, expect, it } from "vitest";
import { agoKey, agoParts, docStatus, filterDocs, fixFor, isFromIssuer, parseStatusFilter, parseTab, statusOfDoc } from "../src/lib/ui-logic";
import type { VaultDoc } from "../src/lib/vault";
import type { VerifyOutcome } from "../src/lib/verify";

const doc = (id: string, over: Partial<VaultDoc> = {}): VaultDoc => ({ id, doc_type: "degree_certificate", title: `Doc ${id}`, issuer: "Test University", serial: `S-${id}`, capture: "digital", fields: {}, ...over });
const verdict = (state: string, freshness = "fresh") => ({ state, freshness }) as unknown as VerifyOutcome;

describe("docStatus", () => {
  it("maps every engine state to one of the four everyday words", () => {
    expect(docStatus("verified", "fresh")).toBe("verified");
    expect(docStatus("verified", "stale")).toBe("attention");
    expect(docStatus("superseded")).toBe("attention");
    expect(docStatus("tamper_flagged")).toBe("rejected");
    expect(docStatus("revoked")).toBe("rejected");
    for (const s of ["unverifiable", "not_checked", "no_serial", undefined, "something_new"]) expect(docStatus(s), String(s)).toBe("unchecked");
  });

  it("reads the latest verification of a document", () => {
    const ctx = { verification: { a: verdict("verified"), b: verdict("revoked"), c: verdict("verified", "stale") } };
    expect(statusOfDoc(doc("a"), ctx)).toBe("verified");
    expect(statusOfDoc(doc("b"), ctx)).toBe("rejected");
    expect(statusOfDoc(doc("c"), ctx)).toBe("attention");
    expect(statusOfDoc(doc("d"), ctx)).toBe("unchecked");
  });
});

describe("agoParts", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");
  const ago = (s: number) => agoParts(new Date(now.getTime() - s * 1000).toISOString(), now);
  it("rounds down to minutes, hours and days", () => {
    expect(agoParts(undefined, now)).toEqual({ unit: "never" });
    expect(ago(0)).toEqual({ unit: "now" });
    expect(ago(59)).toEqual({ unit: "now" });
    expect(ago(60)).toEqual({ unit: "minutes", n: 1 });
    expect(ago(3599)).toEqual({ unit: "minutes", n: 59 });
    expect(ago(3600)).toEqual({ unit: "hours", n: 1 });
    expect(ago(86_399)).toEqual({ unit: "hours", n: 23 });
    expect(ago(86_400)).toEqual({ unit: "days", n: 1 });
    expect(ago(86_400 * 9 + 5)).toEqual({ unit: "days", n: 9 });
  });
  it("says it in words, with the singular for exactly one", () => {
    expect(agoKey({ unit: "never" })).toEqual({ key: "home.neverChecked" });
    expect(agoKey({ unit: "now" })).toEqual({ key: "time.now" });
    expect(agoKey({ unit: "minutes", n: 1 })).toEqual({ key: "time.minute" });
    expect(agoKey({ unit: "minutes", n: 5 })).toEqual({ key: "time.minutes", n: 5 });
    expect(agoKey({ unit: "hours", n: 1 })).toEqual({ key: "time.hour" });
    expect(agoKey({ unit: "hours", n: 23 })).toEqual({ key: "time.hours", n: 23 });
    expect(agoKey({ unit: "days", n: 1 })).toEqual({ key: "time.day" });
    expect(agoKey({ unit: "days", n: 9 })).toEqual({ key: "time.days", n: 9 });
  });
  it("a time in the future counts as now", () => {
    expect(agoParts("2026-10-24T13:00:00.000Z", now)).toEqual({ unit: "now" });
  });
});

describe("fixFor", () => {
  it("gives nothing for a satisfied rule", () => {
    for (const p of ["doc_exists", "verified", "not_expired", "name_consistent", "scan_confirmed", "age_at_least"]) expect(fixFor(p, "pass", ["x"])).toBeNull();
  });
  it("gives the one plain button for each kind of unmet rule", () => {
    expect(fixFor("doc_exists", "fail", [])).toEqual({ key: "fix.add", href: "/add" });
    expect(fixFor("verified", "unknown", ["d1"])).toEqual({ key: "fix.check", href: "/doc/d1" });
    expect(fixFor("verified", "fail", [])).toEqual({ key: "fix.check", href: "/verify" });
    expect(fixFor("not_expired", "fail", ["d1"])).toEqual({ key: "fix.newer", href: "/add" });
    expect(fixFor("not_expired", "unknown", ["d1"])).toEqual({ key: "fix.number", href: "/doc/d1" });
    expect(fixFor("name_consistent", "unknown", ["a", "b"])).toEqual({ key: "fix.you", href: "/names" });
    expect(fixFor("name_consistent", "fail", ["a", "b"])).toEqual({ key: "fix.you", href: "/names" });
    expect(fixFor("scan_confirmed", "unknown", ["m"])).toEqual({ key: "fix.number", href: "/doc/m" });
    expect(fixFor("age_at_least", "unknown", ["i"])).toEqual({ key: "fix.number", href: "/doc/i" });
  });
  it("offers nothing when nothing can be done (under the age limit)", () => {
    expect(fixFor("age_at_least", "fail", ["i"])).toBeNull();
    expect(fixFor("a_rule_kind_nobody_knows", "fail", ["i"])).toBeNull();
  });
});

describe("Home tabs, search and status filter", () => {
  const docs = [
    doc("deg"),
    doc("inc", { doc_type: "income_certificate", title: "Income certificate", issuer: "Revenue Office" }),
    doc("mark", { doc_type: "marksheet", title: "Marksheet (semester 8)", capture: "scan" }),
    doc("letter", { doc_type: "reference_letter", title: "Reference letter", serial: null, issuer: null }),
  ];
  const ctx = { verification: { deg: verdict("verified"), inc: verdict("revoked") } };

  it("splits documents by whether the issuer can be asked", () => {
    expect(docs.map((d) => isFromIssuer(d))).toEqual([true, true, false, false]);
    expect(filterDocs(docs, ctx, { tab: "issuer", q: "", status: "all" }).map((d) => d.id)).toEqual(["deg", "inc"]);
    expect(filterDocs(docs, ctx, { tab: "mine", q: "", status: "all" }).map((d) => d.id)).toEqual(["mark", "letter"]);
  });

  it("every document is on exactly one tab", () => {
    const a = filterDocs(docs, ctx, { tab: "issuer", q: "", status: "all" });
    const b = filterDocs(docs, ctx, { tab: "mine", q: "", status: "all" });
    expect([...a, ...b].map((d) => d.id).sort()).toEqual(docs.map((d) => d.id).sort());
  });

  it("search matches the title, the issuer and the type, ignoring case", () => {
    expect(filterDocs(docs, ctx, { tab: "issuer", q: "INCOME", status: "all" }).map((d) => d.id)).toEqual(["inc"]);
    expect(filterDocs(docs, ctx, { tab: "issuer", q: "revenue", status: "all" }).map((d) => d.id)).toEqual(["inc"]);
    expect(filterDocs(docs, ctx, { tab: "issuer", q: "degree certificate", status: "all" }).map((d) => d.id)).toEqual(["deg"]);
    expect(filterDocs(docs, ctx, { tab: "issuer", q: "nothing matches this", status: "all" })).toEqual([]);
  });

  it("the status filter keeps only that status", () => {
    expect(filterDocs(docs, ctx, { tab: "issuer", q: "", status: "verified" }).map((d) => d.id)).toEqual(["deg"]);
    expect(filterDocs(docs, ctx, { tab: "issuer", q: "", status: "rejected" }).map((d) => d.id)).toEqual(["inc"]);
    expect(filterDocs(docs, ctx, { tab: "mine", q: "", status: "unchecked" }).map((d) => d.id)).toEqual(["mark", "letter"]);
    expect(filterDocs(docs, ctx, { tab: "issuer", q: "", status: "attention" })).toEqual([]);
  });

  it("odd address values fall back to the defaults", () => {
    expect(parseTab("mine")).toBe("mine");
    expect(parseTab("<script>")).toBe("issuer");
    expect(parseTab(undefined)).toBe("issuer");
    expect(parseStatusFilter("verified")).toBe("verified");
    expect(parseStatusFilter("DROP TABLE")).toBe("all");
  });
});
