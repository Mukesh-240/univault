/**
 * ISSUER RE-CHECK tests (src/lib/recheck.ts + the cron guard in src/lib/cron-auth.ts). In plain words:
 *   - a document that the issuer REVOKES after it was shared raises exactly one alert (a
 *     "recheck.affected" ledger line the owner's bell shows), and a second run does not repeat it;
 *   - when nothing changed at the issuer, no alert is raised;
 *   - when the issuer is DOWN the document is "unknown", never "failed", and no alert is raised;
 *   - the scheduled route only runs for the exact CRON_SECRET, and refuses everyone when none is set.
 * Everything runs through the real pipeline (seeded showcase vault, signed registry, runVerification)
 * on the offline store. The document is picked by what the verifier says, not by name or serial.
 */
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { cronAuthorized } from "../src/lib/cron-auth";
import { issueEntry } from "../src/lib/issuer";
import { verify } from "../src/lib/ledger";
import { newStore, offlineClient } from "../src/lib/offline-db";
import { recheckActiveShares } from "../src/lib/recheck";
import { fromRow, toRow } from "../src/lib/registry";
import { seedDataset } from "../src/lib/seed";
import { createShare, listNotifications } from "../src/lib/share-store";
import { shareToken } from "../src/lib/shares";
import { loadVault } from "../src/lib/vault";
import { runVerification } from "../src/lib/verify-run";
import { generate } from "../synthetic/generate";

const NOW = new Date("2026-10-24T10:00:00.000Z");
const k = generateKeyPairSync("ed25519");
const PRIV = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const PUB = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");

/** Seed the showcase, find one document the issuer currently verifies, and share it. */
async function sharedVerifiedDoc() {
  const store = newStore();
  const db = offlineClient(store) as unknown as SupabaseClient;
  const { dataset } = generate({ seed: 2026, set: "showcase", today: "2026-10-24" });
  await seedDataset(db, dataset, PRIV);
  const vault = await loadVault(db, "demo", "2026-10-24");
  let doc: (typeof vault.docs)[number] | undefined;
  for (const d of vault.docs.filter((x) => x.serial && x.capture === "digital")) {
    const r = await runVerification(db, d.id, PUB);
    if (r.ok && r.outcome.state === "verified") { doc = d; break; }
  }
  if (!doc) throw new Error("showcase has no issuer-verified digital document");
  const { tokenHash } = shareToken(PRIV, "6f1c2a8e-0000-4000-8000-0000000000aa");
  await createShare(db, {
    owner: "demo", recipientName: "Recipient", tokenHash, previewedAt: NOW.toISOString(),
    draft: { recipient_code: "UV-R-1042", purpose: "job", fields: [`${doc.doc_type}.name`], expires_at: "2026-11-01T00:00:00.000Z", policy: { mode: "view_only" } },
    snapshot: { idem: "6f1c2a8e-0000-4000-8000-0000000000aa", docs: [{ id: doc.id, title: doc.title, doc_type: doc.doc_type, state: "verified", checked_at: NOW.toISOString() }] },
  });
  const run = () => recheckActiveShares(db, { owner: "demo", issuerPub: PUB, now: NOW, source: "cron" });
  const alerts = () => store.tables.ledger.filter((l) => l.kind === "recheck.affected");
  return { db, doc, run, alerts };
}

describe("issuer re-check", () => {
  it("unchanged at the issuer: no alert", async () => {
    const { run, alerts } = await sharedVerifiedDoc();
    const r = await run();
    expect(r).toMatchObject({ checked: 1, affected: [], unknown: [], alerts_raised: 0 });
    expect(alerts()).toHaveLength(0);
  });

  it("revoked after sharing: one alert, shown in the bell, not repeated on the next run", async () => {
    const { db, doc, run, alerts } = await sharedVerifiedDoc();
    // The issuer publishes a new signed version marking the record revoked (append-only; old rows stay).
    const latest = fromRow(((await db.from("issuer_registry").select("*").eq("serial", doc.serial!).order("version", { ascending: false })).data ?? [])[0] as Record<string, unknown>);
    const revoked = issueEntry(doc.fields, { serial: latest.serial, doc_type: latest.doc_type, issuer_name: latest.issuer_name, status: "revoked", version: latest.version + 1 }, PRIV);
    expect((await db.from("issuer_registry").insert(toRow(revoked))).error).toBeNull();

    const first = await run();
    expect(first.alerts_raised).toBe(1);
    expect(first.affected).toEqual([expect.objectContaining({ document_id: doc.id, kind: "revoked", alerted_now: true })]);
    expect(first.affected[0].shares).toHaveLength(1);
    expect(alerts()).toHaveLength(1);
    expect((await listNotifications(db, "demo")).filter((n) => n.kind === "issuer_change")).toHaveLength(1);

    const second = await run();
    expect(second.affected[0]).toMatchObject({ kind: "revoked", alerted_now: false });
    expect(second.alerts_raised).toBe(0);
    expect(alerts()).toHaveLength(1);
    expect((await verify(db)).ok).toBe(true);
  });

  it("issuer down: the document is unknown, not failed, and no alert is raised", async () => {
    const { db, doc, run, alerts } = await sharedVerifiedDoc();
    await db.from("issuer_config").update({ is_down: true }).eq("id", 1);
    const r = await run(); // waits the real 8-second limit once
    expect(r.affected).toEqual([]);
    expect(r.unknown).toEqual([expect.objectContaining({ document_id: doc.id })]);
    expect(r.alerts_raised).toBe(0);
    expect(alerts()).toHaveLength(0);
  }, 20_000);
});

describe("cron guard", () => {
  it("only the exact secret passes; no secret configured means nobody passes", () => {
    expect(cronAuthorized("Bearer s3cret-value", "s3cret-value")).toBe("ok");
    expect(cronAuthorized("Bearer s3cret-valuX", "s3cret-value")).toBe("denied");
    expect(cronAuthorized("s3cret-value", "s3cret-value")).toBe("denied");
    expect(cronAuthorized(null, "s3cret-value")).toBe("denied");
    expect(cronAuthorized("Bearer ", "")).toBe("not_configured");
    expect(cronAuthorized("Bearer x", undefined)).toBe("not_configured");
  });
});
