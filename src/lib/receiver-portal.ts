/**
 * RECEIVER PORTAL — what a receiving organisation (or person) can do, as server functions.
 *
 *   inboxFor        the shares ADDRESSED TO this receiver code (nothing else), newest first, with their state.
 *   openForReceiver open one of those shares inside the app: only if it is addressed to this receiver and the link is
 *                   still alive (not stopped, replaced, expired, or opened too many times). It records the opening in
 *                   the access log like any opening, and returns the minimal watermarked view.
 *   sendRequest     "Ask for a document": a request line in the ledger (ids and item names only, no free text).
 *   requestsFor     the requests this receiver sent, each "waiting" or "answered" (a share to this receiver after the
 *                   request, covering at least one asked item).
 *   requestsToHolder the requests addressed to a holder (for the sender screens).
 *   reportProblem   a "receiver.reported" ledger line with one of three fixed reasons (no free text, so nothing
 *                   personal can enter the append-only ledger).
 *
 * It never shows another receiver share, never a holder vault, and the view is the same minimal view the link page gives.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recipientView } from "./disclosure";
import { append } from "./ledger";
import { checkRequest } from "./overbroad";
import { loadPacks } from "./rules";
import { loadDemoVault } from "./server";
import type { EngineContext } from "./vault";
import { loadShares, logAccess, type ShareView } from "./share-store";
import { hashDevice, linkStatus, newSessionCode } from "./shares";
import { watermarkBackground, watermarkLabel } from "./watermark";

type Db = Pick<SupabaseClient, "from" | "rpc">;

export const REPORT_REASONS = ["looks_wrong", "not_asked", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const inboxFor = (db: Db, code: string, now = new Date()): Promise<ShareView[]> => loadShares(db, null, now, code);

export type OpenFailure = "not_found" | "revoked" | "killed" | "expired" | "max_views";
export type OpenResult =
  | { ok: false; reason: OpenFailure }
  | { ok: true; share: ShareView; view: ReturnType<typeof recipientView>; watermark: string; background: string; session: string; checkedAt: string | null; docs: { title: string; state: string }[] };

export async function openForReceiver(db: Db, code: string, shareId: string, now = new Date(), vault: () => Promise<EngineContext> = () => loadDemoVault(now)): Promise<OpenResult> {
  const share = (await inboxFor(db, code, now)).find((s) => s.id === shareId);
  if (!share || share.recipientCode !== code) return { ok: false, reason: "not_found" };
  const status = linkStatus({ shareRevoked: share.state === "revoked", tokenKilled: share.tokenKilled, expiresAt: share.expiresAt, maxViews: share.policy.max_views, recipientCode: code, policy: share.policy.mode }, now);
  if (status === "denied:revoked") return { ok: false, reason: "revoked" };
  if (status === "denied:killed") return { ok: false, reason: "killed" };
  if (status === "denied:expired") return { ok: false, reason: "expired" };
  if (status !== "active") return { ok: false, reason: "not_found" };
  const opened = share.accesses.filter((a) => a.outcome === "allowed");
  if (share.policy.max_views !== undefined && opened.length >= share.policy.max_views) return { ok: false, reason: "max_views" };

  const session = newSessionCode();
  await logAccess(db, { tokenId: share.tokenId, shareId: share.id, outcome: "allowed", deviceHash: hashDevice(`receiver|${code}`), session, notify: opened.length ? null : "first_open" });
  const time = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)} UTC`;
  const w = { name: share.recipientName, recipientCode: code, time, session };
  const checked = share.snapshot.docs.map((d) => d.checked_at).filter((x): x is string => Boolean(x)).sort();
  return {
    ok: true, share, view: recipientView(await vault(), share.fields), watermark: watermarkLabel(w), background: watermarkBackground(w), session,
    checkedAt: checked.at(-1) ?? null, docs: share.snapshot.docs.map((d) => ({ title: d.title, state: d.state })),
  };
}

export interface SentRequest { id: string; at: string; to: string; items: string[]; flagged: boolean; extra: string[] }
type LedgerRow = { seq: number; kind: string; payload: Record<string, unknown>; created_at: string };

/** Newest ledger lines of one kind (filtered by the database, so old lines are never pushed out by newer ones). */
async function ledgerLines(db: Db, kind: string): Promise<LedgerRow[]> {
  const r = await db.from("ledger").select("seq, kind, payload, created_at").eq("kind", kind).order("seq", { ascending: false }).limit(500);
  if (r.error) throw new Error(`ledger unavailable: ${r.error.message}`);
  return (r.data ?? []) as LedgerRow[];
}
const toRequest = (l: LedgerRow): SentRequest => ({
  id: String(l.payload.request_id ?? ""), at: l.created_at, to: String(l.payload.to ?? ""), items: (l.payload.items as string[]) ?? [],
  flagged: Boolean(l.payload.flagged), extra: (l.payload.extra as string[]) ?? [],
});

export async function sendRequest(db: Db, a: { from: string; fromPurpose: string; to: string; items: string[] }): Promise<{ ok: true; id: string; flagged: boolean } | { ok: false; error: string }> {
  const items = [...new Set(a.items)];
  if (!items.length) return { ok: false, error: "Tick at least one thing you need." };
  const check = checkRequest({ recipient_purpose: a.fromPurpose, purpose: a.fromPurpose, requested: items }, loadPacks());
  const id = randomBytes(8).toString("hex");
  await append(db, "request.sent", { request_id: id, from: a.from, to: a.to, items, flagged: check.flagged, extra: check.extra });
  return { ok: true, id, flagged: check.flagged };
}

/** The requests this receiver sent, with whether each has been answered by a share to it. */
export async function requestsFor(db: Db, code: string): Promise<(SentRequest & { answered: boolean })[]> {
  const sent = (await ledgerLines(db, "request.sent")).filter((l) => l.payload.from === code);
  const shares = await inboxFor(db, code);
  return sent.map((l) => {
    const r = toRequest(l);
    const answered = shares.some((s) => s.createdAt >= r.at && s.fields.some((f) => r.items.includes(f)));
    return { ...r, answered };
  });
}

/** The requests addressed to a holder (shown on the sender screens). */
export async function requestsToHolder(db: Db, holder: string): Promise<(SentRequest & { from: string })[]> {
  return (await ledgerLines(db, "request.sent")).filter((l) => l.payload.to === holder).map((l) => ({ ...toRequest(l), from: String(l.payload.from ?? "") }));
}

export async function reportProblem(db: Db, code: string, shareId: string, reason: ReportReason): Promise<boolean> {
  const share = (await inboxFor(db, code)).find((s) => s.id === shareId);
  if (!share) return false;
  await append(db, "receiver.reported", { share_id: shareId, recipient_code: code, reason });
  return true;
}

export async function reportsAboutHolder(db: Db, holder: string): Promise<{ at: string; shareId: string; code: string; reason: string }[]> {
  const mine = new Set((await loadShares(db, holder)).map((s) => s.id));
  return (await ledgerLines(db, "receiver.reported")).filter((l) => mine.has(String(l.payload.share_id)))
    .map((l) => ({ at: l.created_at, shareId: String(l.payload.share_id), code: String(l.payload.recipient_code), reason: String(l.payload.reason) }));
}
