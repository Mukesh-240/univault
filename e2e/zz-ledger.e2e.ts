/**
 * LAST TEST OF THE RUN — verify_ledger(): after every journey above (issuing, sharing, requests, eligibility, kills,
 * erasures, faults), the whole hash chain must still verify. This file's name sorts last so it runs after all the others.
 */
import { expect, test } from "@playwright/test";

test("the ledger still verifies after the whole run", async ({ request }) => {
  const r = await request.get("/api/ledger");
  expect(r.status()).toBe(200);
  const v = (await r.json()) as { ok: boolean; total: number; broken_at: number | null };
  expect(v.ok).toBe(true);
  expect(v.total).toBeGreaterThan(100);
  expect(v.broken_at).toBeNull();
});
