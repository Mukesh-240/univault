/**
 * UI LOGIC — the small, pure rules the friendly screens share (no database, no React, easy to test).
 * They only RE-LABEL and RE-ARRANGE what the engines already decided; none of them decides anything.
 *
 *   docStatus()  the four everyday words for a document: Verified / Needs your attention / Not accepted /
 *                Not checked yet (from the engine's verification state).
 *   agoParts()   "3 hours ago" as a unit and a number, so the screen can say it in either language.
 *   fixFor()     for a readiness rule that is not satisfied: the one plain button that helps
 *                ("Check this document", "Confirm it is you", "Fix a wrong number", "Add a document").
 *   isFromIssuer(), filterDocs()  the Home screen's two tabs, search box and status filter.
 */
import type { EngineContext, VaultDoc } from "./vault";

// ─────────────────────────── Status words ───────────────────────────

export type Status = "verified" | "attention" | "rejected" | "unchecked";
export const STATUSES: Status[] = ["verified", "attention", "rejected", "unchecked"];

/**
 *   verified (fresh)                 -> Verified
 *   verified but older than 24 hours -> Needs your attention (check it again)
 *   replaced by the issuer           -> Needs your attention
 *   doesn't match / revoked          -> Not accepted
 *   issuer unreachable / not checked / no serial number -> Not checked yet
 */
export function docStatus(state: string | undefined, freshness?: string): Status {
  switch (state) {
    case "verified": return freshness === "stale" ? "attention" : "verified";
    case "superseded": return "attention";
    case "tamper_flagged":
    case "revoked": return "rejected";
    default: return "unchecked"; // unverifiable, not_checked, no_serial, nothing yet
  }
}

export function statusOfDoc(doc: Pick<VaultDoc, "id">, ctx: Pick<EngineContext, "verification">): Status {
  const v = ctx.verification[doc.id];
  return docStatus(v?.state, v?.freshness);
}

// ─────────────────────────── "3 hours ago" ───────────────────────────

export type Ago = { unit: "never" } | { unit: "now" } | { unit: "minutes" | "hours" | "days"; n: number };

/** How long ago `iso` was, rounded down to minutes, hours or days. `undefined` means never. */
export function agoParts(iso: string | undefined | null, now: Date): Ago {
  if (!iso) return { unit: "never" };
  const s = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (s < 60) return { unit: "now" };
  if (s < 3600) return { unit: "minutes", n: Math.floor(s / 60) };
  if (s < 86_400) return { unit: "hours", n: Math.floor(s / 3600) };
  return { unit: "days", n: Math.floor(s / 86_400) };
}

/** The locale key (and number) that says an Ago in words: "1 hour ago", "3 hours ago", "just now", "Never checked". */
export function agoKey(a: Ago): { key: string; n?: number } {
  if (a.unit === "never") return { key: "home.neverChecked" };
  if (a.unit === "now") return { key: "time.now" };
  return a.n === 1 ? { key: `time.${a.unit.slice(0, -1)}` } : { key: `time.${a.unit}`, n: a.n };
}

// ─────────────────────────── The fixing button ───────────────────────────

export interface Fix { key: "fix.add" | "fix.check" | "fix.you" | "fix.number" | "fix.newer"; href: string }

/**
 * For a readiness rule that is NOT satisfied, the one button that helps. `predicate` is the rule's kind,
 * `status` its answer ("fail" or "unknown"), `documentIds` the documents it used.
 * Returns null when there is nothing the person can do (for example, under the age limit).
 */
export function fixFor(predicate: string, status: "pass" | "fail" | "unknown", documentIds: string[]): Fix | null {
  if (status === "pass") return null;
  const doc = documentIds[0] ? `/doc/${documentIds[0]}` : null;
  switch (predicate) {
    case "doc_exists": return { key: "fix.add", href: "/add" };
    case "verified": return { key: "fix.check", href: doc ?? "/verify" };
    case "not_expired": return status === "fail" ? { key: "fix.newer", href: "/add" } : { key: "fix.number", href: doc ?? "/ocr" };
    case "name_consistent": return { key: "fix.you", href: "/names" };
    case "scan_confirmed": return { key: "fix.number", href: doc ?? "/ocr" };
    case "age_at_least": return status === "fail" ? null : { key: "fix.number", href: doc ?? "/ocr" };
    default: return null;
  }
}

// ─────────────────────────── Home: tabs, search, filter ───────────────────────────

export type Tab = "issuer" | "mine";
export type StatusFilter = "all" | Status;

/**
 * "From issuers" = a digital original that carries an issuer serial number (so the issuer can be asked).
 * "Uploaded by me" = everything else: photos of paper, and letters with no issuer serial number.
 */
export const isFromIssuer = (d: Pick<VaultDoc, "capture" | "serial">) => d.capture === "digital" && Boolean(d.serial);

export const parseTab = (v: string | undefined): Tab => (v === "mine" ? "mine" : "issuer");
export const parseStatusFilter = (v: string | undefined): StatusFilter => (STATUSES as string[]).includes(v ?? "") ? (v as Status) : "all";

export function filterDocs(docs: VaultDoc[], ctx: Pick<EngineContext, "verification">, o: { tab: Tab; q: string; status: StatusFilter }): VaultDoc[] {
  const q = o.q.trim().toLowerCase();
  return docs.filter((d) => {
    if ((o.tab === "issuer") !== isFromIssuer(d)) return false;
    if (o.status !== "all" && statusOfDoc(d, ctx) !== o.status) return false;
    return !q || `${d.title} ${d.issuer ?? ""} ${d.doc_type.replace(/_/g, " ")}`.toLowerCase().includes(q);
  });
}

// ─────────────────────────── Home: "Needs your attention" ───────────────────────────

/** One row of the Home attention card: one TITLE (never repeated), how many copies have it, and the worst status. */
export interface AttentionRow { title: string; docId: string; status: Exclude<Status, "verified">; copies: number; open: number }
const SEVERITY: Record<Status, number> = { rejected: 3, attention: 2, unchecked: 1, verified: 0 };

/**
 * The documents that need a look, grouped by title so the same title is never listed twice ("Degree certificate:
 * 3 copies, 1 not checked"), worst first (not accepted, then needs attention, then not checked), at most `max` rows.
 * `total` is how many documents need a look in all.
 */
export function attentionRows(docs: Pick<VaultDoc, "id" | "title">[], ctx: Pick<EngineContext, "verification">, max = 3): { rows: AttentionRow[]; total: number } {
  const groups = new Map<string, { docs: { id: string; status: Status }[] }>();
  for (const d of docs) {
    const g = groups.get(d.title) ?? { docs: [] };
    g.docs.push({ id: d.id, status: statusOfDoc(d, ctx) });
    groups.set(d.title, g);
  }
  const rows: AttentionRow[] = [];
  let total = 0;
  for (const [title, g] of groups) {
    const open = g.docs.filter((x) => x.status !== "verified");
    total += open.length;
    if (!open.length) continue;
    const worst = open.reduce((a, b) => (SEVERITY[b.status] > SEVERITY[a.status] ? b : a));
    rows.push({ title, docId: worst.id, status: worst.status as AttentionRow["status"], copies: g.docs.length, open: open.length });
  }
  rows.sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || a.title.localeCompare(b.title));
  return { rows: rows.slice(0, max), total };
}
