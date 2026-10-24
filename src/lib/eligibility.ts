/**
 * ELIGIBILITY CHECK (F24) — "ready or not under these criteria", answered on the same pipeline, in details-only form.
 *
 * Plain-English picture:
 *   A requester (for example a scholarship body) asks about the criteria of ITS purpose (a rule pack). The holder sees who
 *   is asking, why, and each criterion, and AUTHORISES PER CRITERION. Only the authorised criteria are evaluated, with
 *   the same deterministic engine that powers readiness. Each answer is one of:
 *       met        the evidence is there, checked, and satisfies the criterion;
 *       not met    the evidence is there and clearly does not satisfy it (an age limit, for example);
 *       unknown    anything else: missing, expired, conflicting, unconfirmed or unverified evidence is NEVER "not met".
 *   The result is an ATTESTATION signed by UNIVAULT. It says it is not proof (UNIVAULT sees the full data and the
 *   institution decides), it carries no document value, id or file, and consenting to the check NEVER gives access to a
 *   document: documents need a separate share. The wording is "ready / not ready under these criteria", never "eligible".
 *   Every step (request, answer, decline) is a ledger line. Nothing here reads a person, a serial or the synthetic flag.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canon, signText, verifyText } from "./crypto";
import { append } from "./ledger";
import { evaluatePack, loadPacks, type RulePack } from "./rules";
import type { EngineContext } from "./vault";

type Db = Pick<SupabaseClient, "from" | "rpc">;
export type CriterionResult = "met" | "not_met" | "unknown";
export const NOT_PROOF = "This is a statement signed by UNIVAULT, which sees your full data. It is not proof, and it does not give anyone access to a document. The institution decides.";

export interface Attestation {
  request_id: string; pack_id: string; purpose: string; issued_at: string; statement: string;
  overall: "ready" | "not_ready" | "needs_confirmation";
  results: { rule_id: string; label: string; result: CriterionResult }[];
}
export interface EligibilityRequest { id: string; at: string; from: string; to: string; packId: string; status: "waiting" | "answered" | "declined" }

const lines = async (db: Db, kind: string) => {
  const r = await db.from("ledger").select("seq, payload, created_at").eq("kind", kind).order("seq", { ascending: false }).limit(500);
  if (r.error) throw new Error(`ledger unavailable: ${r.error.message}`);
  return (r.data ?? []) as { seq: number; payload: Record<string, unknown>; created_at: string }[];
};

export const packFor = (purpose: string, packs: RulePack[] = loadPacks()) => packs.find((p) => p.purpose === purpose) ?? null;

/** How one engine result becomes an eligibility answer: only clear evidence can say "not met". */
export function toCriterion(status: "pass" | "fail" | "unknown", predicate: string, documentIds: string[]): CriterionResult {
  if (status === "pass") return "met";
  if (status === "fail" && predicate === "age_at_least" && documentIds.length > 0) return "not_met";
  return "unknown";
}

export async function requestEligibility(db: Db, a: { from: string; to: string; purpose: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const pack = packFor(a.purpose);
  if (!pack) return { ok: false, error: "There is no set of criteria for this purpose." };
  const id = randomBytes(8).toString("hex");
  await append(db, "eligibility.requested", { request_id: id, from: a.from, to: a.to, pack_id: pack.id });
  return { ok: true, id };
}

/** Every eligibility request, with where it stands (waiting, answered or declined). */
export async function eligibilityRequests(db: Db, who: { from?: string; to?: string }): Promise<EligibilityRequest[]> {
  const [asked, answered, declined] = await Promise.all([lines(db, "eligibility.requested"), lines(db, "eligibility.answered"), lines(db, "eligibility.declined")]);
  const done = new Set(answered.map((l) => l.payload.request_id)), no = new Set(declined.map((l) => l.payload.request_id));
  return asked.filter((l) => (!who.from || l.payload.from === who.from) && (!who.to || l.payload.to === who.to)).map((l) => ({
    id: String(l.payload.request_id), at: l.created_at, from: String(l.payload.from), to: String(l.payload.to), packId: String(l.payload.pack_id),
    status: done.has(l.payload.request_id) ? "answered" : no.has(l.payload.request_id) ? "declined" : "waiting",
  }));
}

export async function declineEligibility(db: Db, holder: string, requestId: string): Promise<boolean> {
  const r = (await eligibilityRequests(db, { to: holder })).find((x) => x.id === requestId);
  if (!r || r.status !== "waiting") return false;
  await append(db, "eligibility.declined", { request_id: requestId, from: r.from, to: holder });
  return true;
}

/** Evaluate ONLY the criteria the holder authorised, sign the result, record it. */
export async function answerEligibility(db: Db, a: { holder: string; requestId: string; authorised: string[]; ctx: EngineContext; privB64: string; now?: Date }):
  Promise<{ ok: true; attestation: Attestation; signature: string } | { ok: false; error: string }> {
  const req = (await eligibilityRequests(db, { to: a.holder })).find((x) => x.id === a.requestId);
  if (!req || req.status !== "waiting") return { ok: false, error: "This request is not waiting for an answer." };
  const pack = loadPacks().find((p) => p.id === req.packId);
  if (!pack) return { ok: false, error: "The criteria for this request are no longer available." };
  const chosen = pack.rules.filter((r) => a.authorised.includes(r.id));
  if (!chosen.length) return { ok: false, error: "Authorise at least one criterion, or decline the request." };
  const evaluated = evaluatePack({ ...pack, rules: chosen }, a.ctx);
  const results = evaluated.results.map((r) => ({ rule_id: r.ruleId, label: r.label, result: toCriterion(r.status, r.predicate, r.documentIds) }));
  const overall = results.some((r) => r.result === "not_met") ? "not_ready" : results.every((r) => r.result === "met") ? "ready" : "needs_confirmation";
  const attestation: Attestation = { request_id: req.id, pack_id: pack.id, purpose: pack.purpose, issued_at: (a.now ?? new Date()).toISOString(), statement: NOT_PROOF, overall, results };
  const signature = signText(canon(attestation), a.privB64);
  await append(db, "eligibility.answered", { request_id: req.id, from: req.from, to: a.holder, authorised: chosen.length, attestation, signature });
  return { ok: true, attestation, signature };
}

/** The answer a receiver may read: only its own request, only the signed attestation (no document anything). */
export async function eligibilityResult(db: Db, receiver: string, requestId: string): Promise<{ attestation: Attestation; signature: string } | null> {
  const l = (await lines(db, "eligibility.answered")).find((x) => x.payload.request_id === requestId && x.payload.from === receiver);
  return l ? { attestation: l.payload.attestation as Attestation, signature: String(l.payload.signature) } : null;
}

export const attestationValid = (att: Attestation, signature: string, pubB64: string) => verifyText(canon(att), signature, pubB64);
