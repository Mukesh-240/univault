/**
 * SHARE STORE — reading and writing shares, links, access attempts and notifications in the database.
 *
 * Plain-English picture:
 *   Every step is a NEW row (the database refuses edits): a share row, its state events
 *   (drafted -> previewed -> confirmed -> active -> revoked | expired), one link ("token") row holding
 *   only fingerprints, link events (issued -> active -> killed | expired), and one access_log row per
 *   attempt to open a link. Each of these also writes a ledger line. Ledger lines and logs carry ids,
 *   outcomes and fingerprints only — never document values, raw tokens or codes.
 *   The decisions themselves (allowed or denied, notify or not) are made in shares.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShareDraft } from "./consent";
import { recipientView } from "./disclosure";
import { append } from "./ledger";
import { loadDemoVault } from "./server";
import { BLOCKING_STATES, type LinkFacts, type NotifyKind, type Outcome, type PastAccess, type ShareState } from "./shares";
import type { EngineContext, VaultDoc } from "./vault";
import { runVerification } from "./verify-run";

type Db = Pick<SupabaseClient, "from" | "rpc">;

/** What was verified just before sharing, kept with the share (and the idempotency fingerprint). */
export interface Snapshot { idem: string; docs: { id: string; title: string; doc_type: string; state: string; checked_at: string | null }[] }

/** The documents a share's items come from: for each document type, the first such document in the vault
 *  (the same rule recipientView() uses to fill the values). */
export function docsForFields(ctx: Pick<EngineContext, "docs">, fields: string[]): VaultDoc[] {
  const types = [...new Set(fields.map((f) => f.split(".")[0]))];
  return types.flatMap((t) => { const d = ctx.docs.find((x) => x.doc_type === t); return d ? [d] : []; });
}

const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

/** Record one share state change: event row + ledger line. */
async function shareEvent(db: Db, shareId: string, state: ShareState, detail: Record<string, unknown> = {}) {
  must(await db.from("share_events").insert({ share_id: shareId, state, detail }), "share event");
  await append(db, `share.${state}`, { share_id: shareId, ...detail });
}

/** Record one link state change: event row + ledger line. */
async function tokenEvent(db: Db, tokenId: string, state: "issued" | "active" | "killed" | "expired", reason: string | null = null) {
  must(await db.from("token_events").insert({ token_id: tokenId, state, reason }), "token event");
  await append(db, `token.${state}`, { token_id: tokenId, reason });
}

/** Create a confirmed share and its link. The raw token is NOT passed in: only its fingerprint.
 *  (One-time codes are issued later, one per opening, and logged as fingerprints in access_log.) */
export async function createShare(db: Db, a: {
  owner: string; draft: ShareDraft; recipientName: string; tokenHash: string; snapshot: Snapshot; previewedAt: string;
}): Promise<{ shareId: string; tokenId: string }> {
  const share = must(await db.from("shares").insert({
    owner: a.owner, recipient: a.draft.recipient_code, purpose: a.draft.purpose, fields: a.draft.fields, expires_at: a.draft.expires_at,
    verification_snapshot: a.snapshot, policy: a.draft.policy,
  }).select("id").single(), "share insert") as { id: string };
  await shareEvent(db, share.id, "drafted");
  await shareEvent(db, share.id, "previewed", { previewed_at: a.previewedAt });
  await shareEvent(db, share.id, "confirmed", { field_count: a.draft.fields.length, policy: a.draft.policy.mode });
  const token = must(await db.from("share_tokens").insert({
    share_id: share.id, recipient_label: a.recipientName, token_hash: a.tokenHash, watermark: `${a.recipientName} · ${a.draft.recipient_code}`,
    recipient_code: a.draft.recipient_code, otp_hash: null,
  }).select("id").single(), "token insert") as { id: string };
  await tokenEvent(db, token.id, "issued");
  await tokenEvent(db, token.id, "active");
  await shareEvent(db, share.id, "active", { token_id: token.id });
  return { shareId: share.id, tokenId: token.id };
}

/** One share as the owner's screens need it. */
export interface ShareView {
  id: string; recipientCode: string; recipientName: string; purpose: string; fields: string[]; expiresAt: string;
  policy: { mode: "view_only" | "download"; max_views?: number }; createdAt: string; state: ShareState; tokenId: string | null;
  tokenKilled: boolean; snapshot: Snapshot; accesses: { outcome: string; at: string; session: string | null; notify: string | null; by: string | null; device: string | null }[];
}

interface ShareRow { id: string; recipient: string; purpose: string; fields: string[]; expires_at: string; policy: ShareView["policy"]; created_at: string; verification_snapshot: Snapshot }

/** All of an owner's shares, newest first, with their current state and every access attempt. */
export async function loadShares(db: Db, owner: string | null, now = new Date(), recipient?: string): Promise<ShareView[]> {
  // owner = the person who shared (the sender screens); recipient = the code a share is addressed to (the receiver
  // screens). Either filter, or both; a receiver only ever asks with its own code.
  let q = db.from("shares").select("*");
  if (owner) q = q.eq("owner", owner);
  if (recipient) q = q.eq("recipient", recipient);
  const shares = must(await q.order("created_at", { ascending: false }), "shares") as ShareRow[];
  if (!shares.length) return [];
  const ids = shares.map((s) => s.id);
  const events = must(await db.from("share_events").select("share_id, state, created_at").in("share_id", ids).order("id"), "share events") as { share_id: string; state: ShareState }[];
  const tokens = must(await db.from("share_tokens").select("id, share_id, recipient_label").in("share_id", ids), "tokens") as { id: string; share_id: string; recipient_label: string }[];
  const tids = tokens.map((t) => t.id);
  const tev = tids.length ? must(await db.from("token_events").select("token_id, state").in("token_id", tids).order("id"), "token events") as { token_id: string; state: string }[] : [];
  const log = tids.length ? must(await db.from("access_log").select("token_id, outcome, client_hint, detail, created_at").in("token_id", tids).order("id"), "access log") as { token_id: string; outcome: string; client_hint: string | null; detail: { session?: string; notify?: string; attempted_by?: string } | null; created_at: string }[] : [];

  return shares.map((s) => {
    const token = tokens.find((t) => t.share_id === s.id);
    const states = events.filter((e) => e.share_id === s.id).map((e) => e.state);
    const last = states.at(-1) ?? "drafted";
    const state: ShareState = states.includes("revoked") ? "revoked" : states.includes("expired") || (last === "active" && Date.parse(s.expires_at) <= now.getTime()) ? "expired" : last;
    return {
      id: s.id, recipientCode: s.recipient, recipientName: token?.recipient_label ?? s.recipient, purpose: s.purpose, fields: s.fields,
      expiresAt: s.expires_at, policy: s.policy, createdAt: s.created_at, state, tokenId: token?.id ?? null,
      tokenKilled: tev.some((e) => e.token_id === token?.id && e.state === "killed"), snapshot: s.verification_snapshot,
      accesses: log.filter((l) => l.token_id === token?.id).map((l) => ({ outcome: l.outcome, at: l.created_at, session: l.detail?.session ?? null, notify: l.detail?.notify ?? null, by: l.detail?.attempted_by ?? null, device: l.client_hint ? l.client_hint.slice(0, 8) : null })),
    };
  });
}

/** Everything needed to decide an attempt on the link whose token fingerprint is `tokenHash`. */
export async function linkByTokenHash(db: Db, tokenHash: string): Promise<null | {
  link: LinkFacts; shareId: string; tokenId: string; recipientName: string; purpose: string; fields: string[]; policy: ShareView["policy"]; owner: string; snapshot: Snapshot; past: PastAccess[]; expiredLogged: boolean;
}> {
  const t = await db.from("share_tokens").select("id, share_id, recipient_label, recipient_code").eq("token_hash", tokenHash);
  const token = (must(t, "token lookup") as { id: string; share_id: string; recipient_label: string; recipient_code: string }[])[0];
  if (!token) return null;
  const share = must(await db.from("shares").select("*").eq("id", token.share_id).single(), "share lookup") as ShareRow & { owner: string };
  const events = must(await db.from("share_events").select("state").eq("share_id", share.id), "share events") as { state: string }[];
  const tev = must(await db.from("token_events").select("state").eq("token_id", token.id), "token events") as { state: string }[];
  const past = must(await db.from("access_log").select("outcome, client_hint, detail, created_at").eq("token_id", token.id).order("id"), "access log") as { outcome: string; client_hint: string | null; detail: { code_hash?: string } | null; created_at: string }[];
  return {
    link: { shareRevoked: events.some((e) => e.state === "revoked"), tokenKilled: tev.some((e) => e.state === "killed"), expiresAt: share.expires_at,
      maxViews: share.policy.max_views, recipientCode: token.recipient_code, policy: share.policy.mode },
    shareId: share.id, tokenId: token.id, recipientName: token.recipient_label, purpose: share.purpose, fields: share.fields, policy: share.policy, owner: share.owner,
    snapshot: share.verification_snapshot, past: past.map((p) => ({ outcome: p.outcome, deviceHash: p.client_hint, codeHash: p.detail?.code_hash ?? null, at: p.created_at })), expiredLogged: events.some((e) => e.state === "expired"),
  };
}

/** Record one attempt: access_log row AND a ledger line (spec item 4). */
export async function logAccess(db: Db, a: { tokenId: string | null; shareId: string | null; outcome: Outcome; deviceHash: string; session?: string; notify: NotifyKind | null; fingerprint?: string; codeHash?: string; attemptedBy?: string }) {
  // code_hash: the fingerprint of the one-time code sent (code_issued) or used (allowed) — never the code itself.
  must(await db.from("access_log").insert({ token_id: a.tokenId, outcome: a.outcome, client_hint: a.deviceHash,
    detail: { share_id: a.shareId, session: a.session ?? null, notify: a.notify, fingerprint: a.fingerprint ?? null, code_hash: a.codeHash ?? null, attempted_by: a.attemptedBy ?? null } }), "access log");
  await append(db, `access.${a.outcome.replace("denied:", "denied_")}`, { token_id: a.tokenId, share_id: a.shareId, session: a.session ?? null, notify: a.notify, fingerprint: a.fingerprint ?? null });
}

/** First time an expired link is tried: record the share and link as expired. */
export async function markExpired(db: Db, shareId: string, tokenId: string) {
  await shareEvent(db, shareId, "expired");
  await tokenEvent(db, tokenId, "expired", "share expiry date passed");
}

/** Kill one link: the link dies and its share is revoked. Other shares are untouched. */
export async function killShare(db: Db, shareId: string, reason: string): Promise<boolean> {
  const events = must(await db.from("share_events").select("state").eq("share_id", shareId), "share events") as { state: string }[];
  if (!events.length || events.some((e) => e.state === "revoked" || e.state === "expired")) return false;
  const tokens = must(await db.from("share_tokens").select("id").eq("share_id", shareId), "tokens") as { id: string }[];
  for (const t of tokens) await tokenEvent(db, t.id, "killed", reason);
  await shareEvent(db, shareId, "revoked", { reason });
  return true;
}

/** One document's verification result, as checked just before a share. */
export interface Reverified { id: string; title: string; doc_type: string; state: string; reason: string; checked_at: string | null }

/**
 * Just before a share: re-verify every document the items come from, then build the exact recipient
 * view. `blocked` lists documents in a state that must stop the share (mismatch, replaced, revoked).
 * Used by both /api/share/preview and /api/share/confirm.
 */
export async function reverifyAndView(db: Db, fields: string[], now: Date, issuerPubB64: string) {
  const ctx = await loadDemoVault(now);
  const reverify: Reverified[] = [];
  for (const d of docsForFields(ctx, fields)) {
    if (!d.serial) { reverify.push({ id: d.id, title: d.title, doc_type: d.doc_type, state: "no_serial", reason: "No issuer serial number on this document.", checked_at: null }); continue; }
    const r = await runVerification(db, d.id, issuerPubB64);
    reverify.push(r.ok
      ? { id: d.id, title: d.title, doc_type: d.doc_type, state: r.outcome.state, reason: r.outcome.reason, checked_at: r.outcome.checkedAt }
      : { id: d.id, title: d.title, doc_type: d.doc_type, state: "not_checked", reason: r.error, checked_at: null });
  }
  const blocked = reverify.filter((x) => BLOCKING_STATES.includes(x.state));
  return { reverify, blocked, recipientView: recipientView(await loadDemoVault(now), fields) };
}

/** Owner notifications: attempts flagged in access_log, plus issuer changes found by the re-check. */
/** "Something for you" kinds that are not about a shared link: a receiver asked for documents or for an eligibility
 *  check, or an issuer delivered a new document to this vault. Their words come from detail.name / detail.title. */
export type InboxKind = "document_request" | "eligibility_request" | "document_issued";
export interface Notification { id: string; kind: NotifyKind | "issuer_change" | InboxKind; at: string; shareId: string | null; recipientCode: string | null; purpose: string | null; detail: Record<string, unknown> }

/** Requests addressed to this owner, and documents an issuer delivered to this vault (read from the ledger). */
async function inboxNotifications(db: Db, owner: string, limit: number): Promise<Notification[]> {
  const read = async (kind: string) => must(await db.from("ledger").select("seq, payload, created_at").eq("kind", kind).order("seq", { ascending: false }).limit(limit), "ledger") as { seq: number; payload: Record<string, unknown>; created_at: string }[];
  const [docReq, eligReq, issued] = await Promise.all([read("request.sent"), read("eligibility.requested"), read("issuer.issued")]);
  const names = new Map(((must(await db.from("recipients").select("recipient_code, name"), "recipients") ?? []) as { recipient_code: string; name: string }[]).map((r) => [r.recipient_code, r.name]));
  const out: Notification[] = [];
  const asked = (kind: InboxKind, l: { seq: number; payload: Record<string, unknown>; created_at: string }) => out.push({ id: `ledger:${l.seq}`, kind, at: l.created_at, shareId: null,
    recipientCode: String(l.payload.from ?? ""), purpose: null, detail: { name: names.get(String(l.payload.from)) ?? String(l.payload.from ?? ""), request_id: l.payload.request_id } });
  for (const l of docReq) if (l.payload.to === owner) asked("document_request", l);
  for (const l of eligReq) if (l.payload.to === owner) asked("eligibility_request", l);
  // An issued document belongs to this vault when its document row is owned by this owner.
  const ids = issued.map((l) => String(l.payload.document_id ?? "")).filter(Boolean);
  const mine = ids.length ? new Set(((must(await db.from("documents").select("id").eq("owner", owner).in("id", ids), "documents") ?? []) as { id: string }[]).map((d) => d.id)) : new Set<string>();
  for (const l of issued) if (mine.has(String(l.payload.document_id)))
    out.push({ id: `ledger:${l.seq}`, kind: "document_issued", at: l.created_at, shareId: null, recipientCode: null, purpose: null,
      detail: { name: String(l.payload.issuer_name ?? ""), doc_type: l.payload.doc_type, document_id: l.payload.document_id } });
  return out;
}

export async function listNotifications(db: Db, owner: string, limit = 30): Promise<Notification[]> {
  const shares = await loadShares(db, owner);
  const out: Notification[] = [];
  for (const s of shares)
    s.accesses.forEach((a, i) => { if (a.notify) out.push({ id: `${s.id}:${i}`, kind: a.notify as NotifyKind, at: a.at, shareId: s.id, recipientCode: s.recipientCode, purpose: s.purpose, detail: { outcome: a.outcome, session: a.session, device: a.device } }); });
  const changes = must(await db.from("ledger").select("seq, payload, created_at").eq("kind", "recheck.affected").order("seq", { ascending: false }).limit(limit), "ledger") as { seq: number; payload: Record<string, unknown>; created_at: string }[];
  for (const c of changes) out.push({ id: `ledger:${c.seq}`, kind: "issuer_change", at: c.created_at, shareId: null, recipientCode: null, purpose: null, detail: c.payload });
  out.push(...await inboxNotifications(db, owner, limit));
  return out.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, limit);
}
