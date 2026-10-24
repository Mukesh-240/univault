/**
 * POST /api/verify — check one document with the SIMULATED ISSUER and record the result.
 *
 * Body: { "document_id": "<uuid>", "first_failure_at"?: "<ISO time>", "attempts_made"?: 0..4 }
 *   The last two are the client-polled retry state: when the issuer was unreachable, the screen
 *   calls again at the times given in `retry.nextRetryAt` (10 s, 30 s, 60 s, 120 s after the first
 *   failure), passing these back, until it succeeds or offers "Retry now".
 *
 * Steps: load the document -> (scans: require every OCR field confirmed) -> ask the issuer (max 8 s)
 *        -> signature check -> status -> hash/field comparison -> append a document event (state +
 *        full outcome) and a ledger line (state, registry version, time) -> answer with the outcome.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { append } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { badRequest, serverError, serverKey } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { decideVerification, fieldsToVerify, lookupWithTimeout, type IssuerReply } from "@/lib/verify";
import type { VaultDoc } from "@/lib/vault";

export const dynamic = "force-dynamic";

const Body = z.object({
  document_id: z.string().uuid(),
  first_failure_at: z.string().datetime().optional(),
  attempts_made: z.number().int().min(0).max(4).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { document_id, first_failure_at, attempts_made } = parsed.data;
  try {
    // 1. The document and any fields the person confirmed/corrected.
    const doc = await supabase.from("documents").select("id, doc_type, title, issuer, serial, document_payloads(content, ocr_confidence)").eq("id", document_id).single();
    if (doc.error || !doc.data) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const payload = (Array.isArray(doc.data.document_payloads) ? doc.data.document_payloads[0] : doc.data.document_payloads) as { content: { capture: "digital" | "scan"; fields: Record<string, string> } } | null;
    if (!payload) return NextResponse.json({ error: "This document's content was erased, so it can't be verified." }, { status: 409 });
    if (!doc.data.serial) return NextResponse.json({ error: "This document has no issuer serial number, so the issuer can't be asked about it." }, { status: 422 });
    const assertions = await supabase.from("assertions").select("field, asserted_value").eq("document_id", document_id).order("created_at");
    const confirmed: Record<string, string> = {};
    for (const a of assertions.data ?? []) confirmed[a.field as string] = a.asserted_value as string;

    const vdoc: VaultDoc = { id: document_id, doc_type: doc.data.doc_type, title: doc.data.title, issuer: doc.data.issuer, serial: doc.data.serial, capture: payload.content.capture, fields: payload.content.fields };
    const toCheck = fieldsToVerify(vdoc, { confirmedFields: { [document_id]: confirmed } });
    if (!toCheck.ok) return NextResponse.json({ error: "Please confirm the text read from this scan first.", unconfirmed: toCheck.unconfirmed }, { status: 409 });

    // 2. Ask the simulated issuer, giving up after 8 seconds (counts as "unreachable", never as a mismatch).
    const lookupUrl = new URL("/api/issuer/lookup", req.url);
    const reply = await lookupWithTimeout(async (signal): Promise<IssuerReply> => {
      const r = await fetch(lookupUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serial: doc.data.serial }), signal });
      if (!r.ok) return { reachable: false, history: [] };
      const j = await r.json();
      return { reachable: j.reachable !== false, history: j.history ?? [] };
    });

    // 3. Decide, then record (append-only event + ledger line).
    const now = new Date();
    const outcome = decideVerification(toCheck.fields, toCheck.kind, reply, serverKey("ISSUER_PUBLIC_KEY"), now,
      first_failure_at ? { firstFailureAt: first_failure_at, attemptsMade: attempts_made ?? 0 } : undefined);
    const ev = await supabase.from("document_events").insert({ document_id, state: outcome.state, detail: { outcome, registry_version: outcome.registryVersion ?? null, method: outcome.method } });
    if (ev.error) throw new Error(ev.error.message);
    await append(supabase, "document.verification", {
      document_id, state: outcome.state, method: outcome.method, registry_version: outcome.registryVersion ?? null,
      signature_valid: outcome.signatureValid ?? null, checked_at: outcome.checkedAt, issuer_update: Boolean(outcome.issuerUpdate),
    });
    return NextResponse.json({ ...outcome, explanation: { ...outcome.explanation, documentIds: [document_id] } });
  } catch (e) {
    log("error", "verify failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("verify this document");
  }
}
