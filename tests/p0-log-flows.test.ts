/**
 * PHASE 9 / P0.7 — LOG SCRUB over the main flows. In plain words: issue a document, check it with the issuer, share it,
 * open it as the receiver, ask for something, report a problem, and refuse a bad upload; then prove that NOT ONE
 * sensitive value (the holder name, registration number, serial, the share token, the one-time code) appears in what was
 * logged, and that the log is not simply empty (so the test is not passing by looking at nothing).
 */
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { issueDocument } from "../src/lib/issuer-portal";
import { newStore, offlineClient } from "../src/lib/offline-db";
import { openForReceiver, reportProblem, sendRequest } from "../src/lib/receiver-portal";
import { findLeaks, log, logBuffer } from "../src/lib/scrub";
import { seedDataset } from "../src/lib/seed";
import { createShare } from "../src/lib/share-store";
import { newOneTimeCode, shareToken } from "../src/lib/shares";
import { checkUpload } from "../src/lib/upload-check";
import { loadVault } from "../src/lib/vault";
import { runVerification } from "../src/lib/verify-run";
import { generate } from "../synthetic/generate";

const k = generateKeyPairSync("ed25519");
const PRIV = k.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const PUB = k.publicKey.export({ type: "spki", format: "der" }).toString("base64");

describe("no sensitive value reaches the log in the main flows", () => {
  it("issue -> verify -> share -> open -> ask -> report -> refuse an upload", async () => {
    logBuffer.splice(0);
    const db = offlineClient(newStore()) as unknown as SupabaseClient;
    await seedDataset(db, generate({ seed: 2026, set: "showcase", today: "2026-10-24" }).dataset, PRIV);
    const answers = { name: "Zorblat Quenby", reg_no: "ZQ-884213", degree: "Degree", branch: "Branch", cgpa: "7.91", year_of_passing: "2024" };
    const r = await issueDocument(db, { issuer: "Leak Test Issuer", holderOwner: "demo", docType: "degree_certificate", answers }, PRIV);
    if (!r.ok) throw new Error(r.error);
    await runVerification(db, r.documentId, PUB);
    const recipient = ((await db.from("recipients").select("recipient_code, name")).data ?? [])[0] as { recipient_code: string; name: string };
    const idem = "6f1c2a8e-0000-4000-8000-0000000000cc";
    const t = shareToken(PRIV, idem);
    const code = newOneTimeCode();
    const { shareId } = await createShare(db, {
      owner: "demo", recipientName: recipient.name, tokenHash: t.tokenHash, previewedAt: new Date().toISOString(),
      draft: { recipient_code: recipient.recipient_code, purpose: "job", fields: ["degree_certificate.name"], expires_at: new Date(Date.now() + 86_400_000).toISOString(), policy: { mode: "view_only" } },
      snapshot: { idem, docs: [{ id: r.documentId, title: "Degree", doc_type: "degree_certificate", state: "verified", checked_at: new Date().toISOString() }] },
    });
    const vault = await loadVault(db, "demo", "2026-10-24");
    await openForReceiver(db, recipient.recipient_code, shareId, new Date(), async () => vault);
    await sendRequest(db, { from: recipient.recipient_code, fromPurpose: "job", to: "demo", items: ["id_card.name"] });
    await reportProblem(db, recipient.recipient_code, shareId, "looks_wrong");
    checkUpload(new TextEncoder().encode("MZ not a pdf Zorblat Quenby"));
    log("warn", "upload refused", { problem: "not_pdf" });
    expect(logBuffer.length).toBeGreaterThan(0);
    const sensitive = ["Zorblat Quenby", "ZQ-884213", r.serial, t.token, code, "7.91"];
    expect(findLeaks(logBuffer, sensitive)).toEqual([]);
    expect(logBuffer.join("\n")).not.toMatch(/Zorblat|ZQ-884213/);
  });
});
