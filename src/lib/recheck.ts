/**
 * ISSUER RE-CHECK — "has anything I shared changed at the issuer since I shared it?" (spec F20)
 *
 * Plain-English picture:
 *   For every document used by an ACTIVE share, ask the simulated issuer again through the normal
 *   verification pipeline (runVerification: same 8-second limit, same signature checks, same event and
 *   ledger line). Then sort each document into one of:
 *     - revoked  : the issuer revoked the record                         -> alert
 *     - changed  : the issuer replaced it, or it no longer matches       -> alert
 *     - expired  : its own "valid until" date has passed (readiness rule) -> alert
 *     - unknown  : the issuer could not be reached -> NOT a failure; the next run checks again.
 *                  After the first unreachable answer the rest of this run is marked unknown without
 *                  waiting 8 s each, so one run stays short.
 *     - unchanged: nothing to say.
 *   An alert is a "recheck.affected" ledger line, which the owner's notification bell shows. Each
 *   (document, kind) is alerted ONCE: a re-check every 60 s or every hour does not repeat it.
 *   Nothing is revoked automatically; the owner decides.
 * Used by POST /api/recheck (the /shares page) and GET /api/cron/recheck (the scheduled run).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "./dates";
import { append } from "./ledger";
import { notExpiredFor } from "./rules";
import { loadShares } from "./share-store";
import { loadVault } from "./vault";
import { runVerification } from "./verify-run";

type Db = Pick<SupabaseClient, "from" | "rpc">;

export type AlertKind = "revoked" | "changed" | "expired";
export interface Affected {
  document_id: string; title: string; kind: AlertKind; state: string; reason: string;
  alerted_now: boolean; shares: { id: string; recipient: string; purpose: string }[];
}
export interface RecheckResult {
  checked: number; affected: Affected[]; unknown: { document_id: string; title: string; reason: string }[];
  alerts_raised: number; checked_at: string;
}

/** Which issuer states are a change worth an alert. "unverifiable" is never one: unknown is not failed. */
const KIND_FOR_STATE: Record<string, AlertKind> = { revoked: "revoked", superseded: "changed", tamper_flagged: "changed" };

export async function recheckActiveShares(db: Db, opts: { owner: string; issuerPub: string; now: Date; source: "page" | "cron" }): Promise<RecheckResult> {
  const active = (await loadShares(db as SupabaseClient, opts.owner, opts.now)).filter((s) => s.state === "active");
  const docs = new Map<string, string>(); // document id -> title, for every document an active share used
  for (const s of active) for (const d of s.snapshot.docs) if (d.state !== "no_serial") docs.set(d.id, d.title);

  const vault = await loadVault(db, opts.owner, todayIso(opts.now));
  const prior = await db.from("ledger").select("payload").eq("kind", "recheck.affected");
  if (prior.error) throw new Error(prior.error.message);
  const alreadyAlerted = new Set((prior.data ?? []).map((r) => { const p = r.payload as { document_id?: string; kind?: string }; return `${p.document_id}|${p.kind ?? "changed"}`; }));

  const affected: Affected[] = [];
  const unknown: RecheckResult["unknown"] = [];
  let issuerUnreachable = false;
  for (const [id, title] of docs) {
    if (issuerUnreachable) { unknown.push({ document_id: id, title, reason: "Not checked: the issuer was unreachable earlier in this run. It will be checked again next time." }); continue; }
    const r = await runVerification(db, id, opts.issuerPub);
    if (!r.ok) { unknown.push({ document_id: id, title, reason: r.error }); continue; }
    if (r.outcome.state === "unverifiable") {
      if (r.outcome.retry) issuerUnreachable = true; // the issuer did not answer within 8 s
      unknown.push({ document_id: id, title, reason: r.outcome.reason });
      continue;
    }
    let kind: AlertKind | undefined = KIND_FOR_STATE[r.outcome.state];
    let reason = r.outcome.reason;
    const doc = vault.docs.find((d) => d.id === id);
    if (!kind && doc) {
      const validity = notExpiredFor(doc, vault);
      if (validity.status === "fail" && validity.detail?.daysExpired) { kind = "expired"; reason = validity.reason; }
    }
    if (!kind) continue; // unchanged
    const shares = active.filter((s) => s.snapshot.docs.some((d) => d.id === id)).map((s) => ({ id: s.id, recipient: s.recipientCode, purpose: s.purpose }));
    const isNew = !alreadyAlerted.has(`${id}|${kind}`);
    if (isNew) {
      await append(db, "recheck.affected", { document_id: id, title, kind, state: r.outcome.state, share_ids: shares.map((s) => s.id), source: opts.source });
      alreadyAlerted.add(`${id}|${kind}`);
    }
    affected.push({ document_id: id, title, kind, state: r.outcome.state, reason, alerted_now: isNew, shares });
  }
  return { checked: docs.size, affected, unknown, alerts_raised: affected.filter((a) => a.alerted_now).length, checked_at: opts.now.toISOString() };
}
