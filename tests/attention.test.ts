/** HOME ATTENTION CARD — at most 3 rows, never the same title twice, worst first, real counts. */
import { describe, expect, it } from "vitest";
import { attentionRows } from "../src/lib/ui-logic";

const v = (state: string) => ({ state, freshness: "fresh" }) as never;
describe("attentionRows", () => {
  it("groups copies of one title, keeps the worst status, and never repeats a title", () => {
    const docs = [
      { id: "a", title: "Degree certificate" }, { id: "b", title: "Degree certificate" }, { id: "c", title: "Degree certificate" },
      { id: "d", title: "Income certificate" }, { id: "e", title: "Marksheet" }, { id: "f", title: "ID card" }, { id: "g", title: "Transfer certificate" },
    ];
    const ctx = { verification: { a: v("verified"), b: v("revoked"), d: v("verified"), e: v("superseded") } };
    const { rows, total } = attentionRows(docs, ctx);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(new Set(rows.map((r) => r.title)).size).toBe(rows.length);
    expect(rows[0]).toMatchObject({ title: "Degree certificate", status: "rejected", copies: 3, open: 2, docId: "b" });
    expect(rows[1]).toMatchObject({ title: "Marksheet", status: "attention" });
    expect(total).toBe(5); // b, c, e, f, g
  });
  it("all verified: nothing needs a look", () => {
    expect(attentionRows([{ id: "a", title: "T" }], { verification: { a: v("verified") } })).toEqual({ rows: [], total: 0 });
  });
});
