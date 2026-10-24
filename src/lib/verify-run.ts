/**
 * VERIFY RUN — check one stored document with the SIMULATED ISSUER and record the result.
 *
 * Steps: load the document -> (scans: every OCR field must be confirmed first) -> ask the issuer
 *        (max 8 s) -> signature check -> status -> hash/field comparison -> append a document event
 *        (state + full outcome) and a ledger line -> return the outcome.
 * Used by POST /api/verify, by the share builder (every included document is re-verified just before
 * sharing) and by the issuer re-check. One implementation, so all three always agree.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { issuerLookup } from "./issuer-service";
import { append } from "./ledger";
import type { VaultDoc } from "./vault";
import { decideVerification, fieldsToVerify, lookupWithTimeout, type VerifyOutcome } from "./verify";

type Db = Pick<SupabaseClient, "from" | "rpc">;

export type VerifyRun =
  | { ok: true; outcome: VerifyOutcome; ledgerSeq?: number }
  | { ok: false; status: number; error: string; unconfirmed?: string[] };

export async function runVerification(db: Db, documentId: string, issuerPubB64: string,
  retry?: { firstFailureAt: string; attemptsMade: number }): Promise<VerifyRun> {
  // 1. The document and any fields the person confirmed/corrected.
  const doc = await db.from("documents").select("id, doc_type, title, issuer, serial, document_payloads(content, ocr_confidence)").eq("id", documentId).single();
  if (doc.error || !doc.data) return { ok: false, status: 404, error: "Document not found." };
  // document_payloads is one-per-document, so Supabase returns it as an object (or null once erased);
  // the client library guesses "list" without generated types, hence the cast through unknown.
  const d = doc.data as unknown as { doc_type: string; title: string; issuer: string | null; serial: string | null; document_payloads: { content: { capture: "digital" | "scan"; fields: Record<string, string>; salts?: Record<string, string> } } | null };
  const payload = d.document_payloads; // one per document: an object, or null once erased
  if (!payload) return { ok: false, status: 409, error: "This document's content was erased, so it can't be verified." };
  if (!d.serial) return { ok: false, status: 422, error: "This document has no issuer serial number, so the issuer can't be asked about it." };
  const assertions = await db.from("assertions").select("field, asserted_value").eq("document_id", documentId).order("created_at");
  const confirmed: Record<string, string> = {};
  for (const a of assertions.data ?? []) confirmed[a.field as string] = a.asserted_value as string;

  const vdoc: VaultDoc = { id: documentId, doc_type: d.doc_type, title: d.title, issuer: d.issuer, serial: d.serial, capture: payload.content.capture, fields: payload.content.fields };
  const toCheck = fieldsToVerify(vdoc, { confirmedFields: { [documentId]: confirmed } });
  if (!toCheck.ok) return { ok: false, status: 409, error: "Please confirm the text read from this scan first.", unconfirmed: toCheck.unconfirmed };

  // 2. Ask the simulated issuer, giving up after 8 seconds (counts as "unreachable", never as a mismatch).
  const serial = d.serial;
  const reply = await lookupWithTimeout((signal) => issuerLookup(db, serial, { signal }).catch(() => ({ reachable: false, history: [] })));

  // 3. Decide, then record (append-only event + ledger line).
  const outcome = decideVerification(toCheck.fields, toCheck.kind, reply, issuerPubB64, new Date(), retry, payload.content.salts);
  const ev = await db.from("document_events").insert({ document_id: documentId, state: outcome.state, detail: { outcome, registry_version: outcome.registryVersion ?? null, method: outcome.method } });
  if (ev.error) throw new Error(ev.error.message);
  const line = await append(db, "document.verification", {
    document_id: documentId, state: outcome.state, method: outcome.method, registry_version: outcome.registryVersion ?? null,
    signature_valid: outcome.signatureValid ?? null, checked_at: outcome.checkedAt, issuer_update: Boolean(outcome.issuerUpdate),
  });
  // ledgerSeq only tells the screen which ledger line was written (for its step trail); it changes no decision.
  return { ok: true, ledgerSeq: line.seq, outcome: { ...outcome, explanation: { ...outcome.explanation, documentIds: [documentId] } } };
}
