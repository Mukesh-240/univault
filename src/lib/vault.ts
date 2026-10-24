/**
 * VAULT — the in-memory picture of one person's vault that every engine works on.
 *
 * Plain-English picture:
 *   The engines (readiness rules, name matching, duplicates, verification...) never talk to the
 *   database themselves. Instead they receive a "context": the person's documents plus what has
 *   happened to them (verification results, fields the person confirmed or corrected, name links
 *   the person confirmed or rejected) and today's date. That keeps every decision a pure
 *   calculation from data — easy to test, and identical for real and synthetic documents.
 *
 *   loadVault() builds that context from the database for the live app.
 *   The evaluation harness builds the same context from generated data.
 *
 * Note what is NOT here: the `synthetic` flag and `synthetic_origin`. They are labels for the
 * screen only, so they are deliberately left out of what engines can see.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerifyOutcome } from "./verify";

/** One document as engines see it. `fields` are the ORIGINAL values (never changed). */
export interface VaultDoc {
  id: string;
  doc_type: string;
  title: string;
  issuer: string | null;
  serial: string | null;
  capture: "digital" | "scan";
  fields: Record<string, string>;
  body_text?: string | null;
  hidden_text?: string | null;
  ocr_confidence?: Record<string, number> | null;
  sha256?: string;
}

/** A person's decision about whether two documents name the same person. */
export interface EntityLink { a: string; b: string; decision: "confirmed_same_person" | "rejected" }

/** Everything the engines need to decide, for one vault, on one day. */
export interface EngineContext {
  docs: VaultDoc[];
  today: string;                                                   // "YYYY-MM-DD"
  verification: Record<string, VerifyOutcome | undefined>;         // latest verification per document id
  confirmedFields: Record<string, Record<string, string>>;         // per document: field -> value the person confirmed/corrected
  links: EntityLink[];
}

/**
 * The value of a field as the engines should trust it:
 *   - a value the person confirmed or corrected (a separate assertion) wins;
 *   - otherwise a digital original's value is trusted;
 *   - otherwise (scan, not confirmed) the OCR value is returned but marked untrusted.
 */
export function fieldValue(doc: VaultDoc, field: string, ctx: Pick<EngineContext, "confirmedFields">): { value: string | undefined; trusted: boolean; corrected: boolean } {
  const asserted = ctx.confirmedFields[doc.id]?.[field];
  if (asserted !== undefined) return { value: asserted, trusted: true, corrected: asserted !== doc.fields[field] };
  return { value: doc.fields[field], trusted: doc.capture === "digital", corrected: false };
}

/** An empty context for a set of documents (nothing verified, confirmed or linked yet). */
export const contextFor = (docs: VaultDoc[], today: string): EngineContext => ({ docs, today, verification: {}, confirmedFields: {}, links: [] });

type Db = Pick<SupabaseClient, "from">;
const VERIFY_STATES = new Set(["verified", "unverifiable", "tamper_flagged", "superseded", "revoked"]);

/**
 * Load one owner's vault from the database: documents + their (still existing) content, the latest
 * verification event per document, confirmed/corrected fields (assertions), and name-link decisions.
 * Erased documents (no payload any more) are left out of decisions.
 */
export async function loadVault(db: Db, owner: string, today: string): Promise<EngineContext> {
  const docs = await db.from("documents").select("id, doc_type, title, issuer, serial, sha256, document_payloads(content, ocr_confidence)").eq("owner", owner).order("created_at");
  if (docs.error) throw new Error(`loading documents failed: ${docs.error.message}`);
  const ids = (docs.data ?? []).map((d) => d.id as string);

  const [events, assertions, links] = await Promise.all([
    db.from("document_events").select("document_id, state, detail, created_at").in("document_id", ids).order("id"),
    db.from("assertions").select("document_id, field, asserted_value, created_at").in("document_id", ids).order("created_at"),
    db.from("entity_links").select("doc_a, doc_b, decision, created_at").in("doc_a", ids).order("created_at"),
  ]);
  for (const r of [events, assertions, links]) if (r.error) throw new Error(`loading vault history failed: ${r.error.message}`);

  const vaultDocs: VaultDoc[] = [];
  for (const d of docs.data ?? []) {
    // One per document: Supabase returns an object (or null once erased), not a list.
    const payload = d.document_payloads as unknown as { content: { capture: "digital" | "scan"; fields: Record<string, string>; body_text: string | null; hidden_text: string | null }; ocr_confidence: Record<string, number> | null } | null;
    if (!payload) continue; // erased: content gone, so it can't take part in decisions
    vaultDocs.push({ id: d.id as string, doc_type: d.doc_type as string, title: d.title as string, issuer: d.issuer as string | null, serial: d.serial as string | null,
      sha256: d.sha256 as string, capture: payload.content.capture, fields: payload.content.fields, body_text: payload.content.body_text, hidden_text: payload.content.hidden_text, ocr_confidence: payload.ocr_confidence });
  }

  // Latest verification outcome per document (events are append-only; the last one wins).
  const verification: EngineContext["verification"] = {};
  for (const e of events.data ?? []) if (VERIFY_STATES.has(e.state as string)) verification[e.document_id as string] = (e.detail as { outcome?: VerifyOutcome })?.outcome;

  // Confirmed / corrected fields (assertions are append-only; the last one per field wins).
  const confirmedFields: EngineContext["confirmedFields"] = {};
  for (const a of assertions.data ?? []) (confirmedFields[a.document_id as string] ??= {})[a.field as string] = a.asserted_value as string;

  // Name-link decisions (the last decision for a pair wins).
  const latest = new Map<string, EntityLink>();
  for (const l of links.data ?? []) latest.set([l.doc_a, l.doc_b].sort().join("|"), { a: l.doc_a as string, b: l.doc_b as string, decision: l.decision as EntityLink["decision"] });

  return { docs: vaultDocs, today, verification, confirmedFields, links: [...latest.values()] };
}

/** The three trust tiers shown on every document card (spec §2). */
export type Tier = "issuer_verified" | "user_corrected" | "user_uploaded";

/**
 * Which tier a document is in RIGHT NOW, computed from what happened to it (never declared by data):
 *   - issuer-verified: the latest verification says "verified" (stale still counts, but is labelled stale);
 *   - user-corrected: the person changed at least one value (an assertion different from the original);
 *   - user-uploaded: everything else.
 */
export function tierOf(doc: VaultDoc, ctx: Pick<EngineContext, "verification" | "confirmedFields">): Tier {
  if (ctx.verification[doc.id]?.state === "verified") return "issuer_verified";
  const asserted = ctx.confirmedFields[doc.id] ?? {};
  if (Object.entries(asserted).some(([f, v]) => v !== doc.fields[f])) return "user_corrected";
  return "user_uploaded";
}
