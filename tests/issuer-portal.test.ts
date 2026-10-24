/**
 * ISSUER PORTAL tests (src/lib/issue-forms.ts + src/lib/issuer-portal.ts). In plain words:
 *   - the issue form refuses missing boxes, impossible dates, bad numbers and years, and an end date before a start;
 *   - an issued document is SIGNED, is added to the registry, and arrives in the holder vault through the normal
 *     front door, where the normal check with the issuer says "verified" (nothing is marked verified by hand);
 *   - bad details store nothing at all;
 *   - an issuer sees and changes only its OWN records;
 *   - "Stop this document" appends a new signed "revoked" version, and the holder next check shows revoked;
 *   - a corrected copy gets a NEW serial and the old record becomes "replaced" (and cannot be replaced twice);
 *   - nothing is ever updated or deleted: the registry only grows, and the ledger chain still verifies.
 * Everything runs through the real pipeline on the offline store, with a freshly made issuer key.
 */
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { checkForm, FORMS, isIsoDate } from "../src/lib/issue-forms";
import { entrySignatureValid } from "../src/lib/issuer";
import { issueDocument, latestEntry, listIssued, revokeSerial, typesFor } from "../src/lib/issuer-portal";
import { verify } from "../src/lib/ledger";
import { newStore, offlineClient } from "../src/lib/offline-db";
import { seedDataset } from "../src/lib/seed";
import { loadVault } from "../src/lib/vault";
import { runVerification } from "../src/lib/verify-run";
import { generate } from "../synthetic/generate";

const k = generateKeyPairSync("ed25519");
const PRIV = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const PUB = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");

async function world() {
  const store = newStore();
  const db = offlineClient(store) as unknown as SupabaseClient;
  await seedDataset(db, generate({ seed: 2026, set: "showcase", today: "2026-10-24" }).dataset, PRIV);
  return { store, db };
}
const UNI = "Synthetic State University"; // a seeded party: a college/university, which may sign degree certificates
const BOARD = "Synthetic Board of Secondary Education";
const GOOD = { name: "Test Holder", reg_no: "R-1001", degree: "Degree", branch: "Branch", cgpa: "8.5", year_of_passing: "2024" };
const issue = (db: SupabaseClient, over: Partial<Parameters<typeof issueDocument>[1]> = {}) =>
  issueDocument(db, { issuer: UNI, holderOwner: "demo", docType: "degree_certificate", answers: GOOD, ...over }, PRIV);

describe("issue form checks", () => {
  it("accepts a complete form and trims it", () => {
    const c = checkForm("degree_certificate", { ...GOOD, name: "  Test Holder  " });
    expect(c.ok).toBe(true);
    expect(c.clean.name).toBe("Test Holder");
  });
  it("names every problem: missing, impossible date, bad number, bad year, bad choice", () => {
    expect(checkForm("degree_certificate", {}).problems.name).toBe("required");
    expect(checkForm("degree_certificate", { ...GOOD, cgpa: "eight" }).problems.cgpa).toBe("bad_number");
    expect(checkForm("degree_certificate", { ...GOOD, year_of_passing: "24" }).problems.year_of_passing).toBe("bad_year");
    expect(checkForm("school_certificate", { name: "A", dob: "2000-02-30", roll_no: "R1", year: "2016", result: "MAYBE" }).problems).toMatchObject({ dob: "bad_date", result: "bad_choice" });
    expect(checkForm("income_certificate", { name: "A", annual_income: "100", issued_on: "2026-05-01", valid_until: "2026-04-01" }).problems.valid_until).toBe("before_start");
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(checkForm("not_a_type", {}).ok).toBe(false);
    expect(Object.keys(FORMS).length).toBeGreaterThanOrEqual(5);
  });
});

describe("issuing", () => {
  it("signs, adds to the registry, delivers through the front door, and the holder check says verified", async () => {
    const { db } = await world();
    const r = await issue(db);
    if (!r.ok) throw new Error(r.error);
    const e = await latestEntry(db, r.serial);
    expect(e?.status).toBe("active");
    expect(entrySignatureValid(e!, PUB)).toBe(true);
    const vault = await loadVault(db, "demo", "2026-10-24");
    expect(vault.docs.find((d) => d.id === r.documentId)?.serial).toBe(r.serial);
    const v = await runVerification(db, r.documentId, PUB);
    expect(v.ok && v.outcome.state).toBe("verified");
    expect((await verify(db)).ok).toBe(true);
  });

  it("bad details store nothing", async () => {
    const { store, db } = await world();
    const before = store.tables.issuer_registry.length, docs = store.tables.documents.length;
    const r = await issue(db, { answers: { ...GOOD, cgpa: "x" } });
    expect(r.ok).toBe(false);
    expect(store.tables.issuer_registry).toHaveLength(before);
    expect(store.tables.documents).toHaveLength(docs);
  });

  it("an issuer sees and stops only its own records", async () => {
    const { db } = await world();
    const mine = await issue(db), other = await issueDocument(db, { issuer: BOARD, holderOwner: "demo", docType: "school_certificate", answers: { name: "Test Holder", dob: "2001-03-04", roll_no: "R-77", year: "2017", result: "PASS" } }, PRIV);
    if (!mine.ok || !other.ok) throw new Error("issue failed");
    const own = (await listIssued(db, UNI)).map((x) => x.serial);
    expect(own).toContain(mine.serial);
    expect(own).not.toContain(other.serial); // another issuer record never shows here
    expect(await revokeSerial(db, UNI, other.serial, PRIV)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("issuer authority (FINAL_FEATURES 1.2)", () => {
  it("a board cannot sign a degree, a university cannot sign a school certificate, an unknown issuer signs nothing", async () => {
    const { store, db } = await world();
    const before = store.tables.issuer_registry.length;
    expect(await issueDocument(db, { issuer: BOARD, holderOwner: "demo", docType: "degree_certificate", answers: GOOD }, PRIV)).toMatchObject({ ok: false, status: 403 });
    expect(await issueDocument(db, { issuer: UNI, holderOwner: "demo", docType: "school_certificate", answers: {} }, PRIV)).toMatchObject({ ok: false, status: 403 });
    expect(await issueDocument(db, { issuer: "Nobody Registered", holderOwner: "demo", docType: "degree_certificate", answers: GOOD }, PRIV)).toMatchObject({ ok: false, status: 403 });
    expect(store.tables.issuer_registry).toHaveLength(before);
  });
  it("the allowed kinds come from the table", async () => {
    expect(await typesFor({} as never, UNI)).toEqual(["degree_certificate", "provisional_certificate"]);
    expect(await typesFor({} as never, BOARD)).toEqual(["school_certificate", "transfer_certificate"]);
    expect(await typesFor({} as never, "Nobody Registered")).toEqual([]);
  });
});

describe("stopping and replacing", () => {
  it("revoke appends a new signed version and the holder next check shows revoked", async () => {
    const { store, db } = await world();
    const r = await issue(db);
    if (!r.ok) throw new Error(r.error);
    const rows = store.tables.issuer_registry.length;
    expect(await revokeSerial(db, UNI, r.serial, PRIV)).toEqual({ ok: true, version: 2 });
    expect(store.tables.issuer_registry).toHaveLength(rows + 1); // appended, nothing changed or removed
    const v = await runVerification(db, r.documentId, PUB);
    expect(v.ok && v.outcome.state).toBe("revoked");
    expect(await revokeSerial(db, UNI, r.serial, PRIV)).toMatchObject({ ok: false, status: 409 });
    expect((await verify(db)).ok).toBe(true);
  });

  it("a corrected copy has a new serial; the old one becomes replaced and cannot be replaced twice", async () => {
    const { db } = await world();
    const a = await issue(db);
    if (!a.ok) throw new Error(a.error);
    const b = await issue(db, { answers: { ...GOOD, cgpa: "9.1" }, supersedes: a.serial });
    if (!b.ok) throw new Error(b.error);
    expect(b.serial).not.toBe(a.serial);
    const old = await latestEntry(db, a.serial);
    expect(old).toMatchObject({ status: "superseded", superseded_by: b.serial, version: 2 });
    const va = await runVerification(db, a.documentId, PUB), vb = await runVerification(db, b.documentId, PUB);
    expect([va.ok && va.outcome.state, vb.ok && vb.outcome.state]).toEqual(["superseded", "verified"]);
    expect(await issue(db, { supersedes: a.serial })).toMatchObject({ ok: false, status: 409 });
  });
});
