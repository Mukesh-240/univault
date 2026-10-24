/**
 * ISSUER PORTAL — what an issuing organisation can do, as server functions.
 *
 *   issueDocument   sign a new record with the issuer key, add it to the registry, and deliver the document to the
 *                   holder through the SAME front door as every other document (ingestDocument). The holder then checks
 *                   it with the issuer like any document. Optionally marks an older record as replaced.
 *   revokeSerial    append a new, signed "revoked" version of a record this issuer issued (the old version stays).
 *   listIssued      the issuer own records, newest first, with their latest status and whether the holder has opened
 *                   (checked) the document yet.
 *   issuerActivity  the issuer own lines in the ledger.
 *
 * What it never does: read a holder vault or shares (it sees only its own registry rows and, for "waiting", the
 * fact that a verification event exists for a serial it issued), update or delete anything (every write is an
 * INSERT), look at the synthetic flag, a person or a serial, or let a browser see the signing key (server only).
 * Ledger lines carry ids and the issuer name only, never a holder value.
 */
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issuerCategory, mayIssue, typesAllowedFor } from "./accounts";
import { dictFor } from "./i18n";
import { ingestDocument } from "./ingest";
import { checkForm, FORMS, initialsOf } from "./issue-forms";
import { issueEntry, newSalts, resignEntry, type RegistryEntry } from "./issuer";
import { append } from "./ledger";
import { fromRow, toRow } from "./registry";

type Db = Pick<SupabaseClient, "from" | "rpc">;

/** The next serial for this issuer and document type: PREFIX-TYPE-123456, never one that is already in the registry. */
export async function newSerial(db: Db, issuer: string, docType: string): Promise<string> {
  const type = docType.split("_").map((w) => w[0]!.toUpperCase()).join("");
  for (let i = 0; i < 8; i++) {
    const serial = `${initialsOf(issuer)}-${type}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const hit = await db.from("issuer_registry").select("serial").eq("serial", serial);
    if (!hit.error && (hit.data ?? []).length === 0) return serial;
  }
  throw new Error("could not find a free serial number");
}

/** The kinds of document this issuer can create: the kinds it has issued before (so a university does not issue income
 *  certificates), limited to the kinds this portal has a form for. An issuer with no history may create any of them. */
export async function typesFor(_db: Db, issuer: string): Promise<string[]> {
  // The authority table decides (document type -> allowed issuer category); only kinds this portal has a form for are offered.
  return Object.keys(FORMS).filter((t) => typesAllowedFor(issuer).includes(t));
}

export interface IssueInput { issuer: string; holderOwner: string; docType: string; answers: Record<string, string>; supersedes?: string }
/** `fieldCount`, `salted` and `ledgerSeq` only describe what ran, for the on-screen step trail; they decide nothing. */
export type IssueResult = { ok: true; serial: string; documentId: string; sha256: string; fieldCount: number; salted: boolean; ledgerSeq: number } | { ok: false; status: number; error: string; problems?: Record<string, string> };

export async function issueDocument(db: Db, a: IssueInput, issuerPrivB64: string): Promise<IssueResult> {
  if (!FORMS[a.docType]) return { ok: false, status: 422, error: "That kind of document cannot be issued here." };
  // Authority: this issuer category may not sign this kind of document. Decided by the table and the issuer account, never by anything written in a document.
  if (!mayIssue(issuerCategory(a.issuer), a.docType)) return { ok: false, status: 403, error: "This issuer is not authorised to sign that kind of document, so nothing was signed." };
  const form = checkForm(a.docType, a.answers);
  if (!form.ok) return { ok: false, status: 422, error: "Some details need fixing.", problems: form.problems };

  // A corrected copy: the old record must be this issuer own, and still active.
  let old: RegistryEntry | null = null;
  if (a.supersedes) {
    old = await latestEntry(db, a.supersedes);
    if (!old || old.issuer_name !== a.issuer) return { ok: false, status: 404, error: "That record was not issued by you." };
    if (old.status !== "active") return { ok: false, status: 409, error: "That record is no longer active, so it cannot be replaced." };
  }

  const serial = await newSerial(db, a.issuer, a.docType);
  const fields = { ...form.clean, serial };
  // 1. Sign and append to the registry (server only: the key never reaches a browser).
  const salts = newSalts(Object.keys(fields)); // fresh random salts: given to the holder, never kept in the registry
  const entry = issueEntry(fields, { serial, doc_type: a.docType, issuer_name: a.issuer, version: 1 }, issuerPrivB64, salts);
  const reg = await db.from("issuer_registry").insert(toRow(entry));
  if (reg.error) throw new Error(`registry insert failed: ${reg.error.message}`);
  // 2. Deliver to the holder through the one front door (it never marks anything verified; the holder check does).
  const title = dictFor("en")[`doctype.${a.docType}`] ?? a.docType.replace(/_/g, " ");
  const stored = await ingestDocument(db, {
    owner: a.holderOwner, doc_type: a.docType, title, issuer: a.issuer, serial, capture: "digital", fields,
    language_scripts: ["latin"], synthetic: true, salts,
  });
  const line = await append(db, "issuer.issued", { serial, doc_type: a.docType, issuer_name: a.issuer, document_id: stored.id, supersedes: a.supersedes ?? null });
  // 3. A corrected copy replaces the old record: a new signed version marks it superseded by the new serial.
  if (old) {
    const next = resignEntry(old, { status: "superseded", superseded_by: serial }, issuerPrivB64);
    const up = await db.from("issuer_registry").insert(toRow(next));
    if (up.error) throw new Error(`registry insert failed: ${up.error.message}`);
    await append(db, "issuer.superseded", { serial: old.serial, superseded_by: serial, issuer_name: a.issuer, version: next.version });
  }
  return { ok: true, serial, documentId: stored.id, sha256: stored.sha256, fieldCount: Object.keys(fields).length, salted: Object.keys(salts).length > 0, ledgerSeq: line.seq };
}

/** The newest registry version of a serial (or null). */
export async function latestEntry(db: Db, serial: string): Promise<RegistryEntry | null> {
  const r = await db.from("issuer_registry").select("*").eq("serial", serial).order("version", { ascending: false }).limit(1);
  if (r.error || !(r.data ?? []).length) return null;
  return fromRow((r.data as Record<string, unknown>[])[0]);
}

export type RevokeResult = { ok: true; version: number } | { ok: false; status: number; error: string };

export async function revokeSerial(db: Db, issuer: string, serial: string, issuerPrivB64: string): Promise<RevokeResult> {
  const cur = await latestEntry(db, serial);
  if (!cur || cur.issuer_name !== issuer) return { ok: false, status: 404, error: "That record was not issued by you." };
  if (cur.status === "revoked") return { ok: false, status: 409, error: "That record is already stopped." };
  const next = resignEntry(cur, { status: "revoked" }, issuerPrivB64);
  const ins = await db.from("issuer_registry").insert(toRow(next));
  if (ins.error) throw new Error(`registry insert failed: ${ins.error.message}`);
  await append(db, "issuer.revoked", { serial, issuer_name: issuer, version: next.version });
  return { ok: true, version: next.version };
}

export interface IssuedRow { serial: string; docType: string; issuedAt: string | null; status: RegistryEntry["status"]; version: number; supersededBy: string | null; waiting: boolean }

/** This issuer records, newest first: the latest version of each serial, and whether the holder has checked it yet. */
export async function listIssued(db: Db, issuer: string): Promise<IssuedRow[]> {
  const r = await db.from("issuer_registry").select("*").eq("issuer_name", issuer);
  if (r.error) throw new Error(`registry unavailable: ${r.error.message}`);
  const bySerial = new Map<string, { latest: RegistryEntry; first: string | null }>();
  for (const row of (r.data ?? []) as Record<string, unknown>[]) {
    const e = fromRow(row);
    const cur = bySerial.get(e.serial);
    const at = (row.issued_at as string | null) ?? null;
    if (!cur) bySerial.set(e.serial, { latest: e, first: at });
    else { if (e.version > cur.latest.version) cur.latest = e; if (at && (!cur.first || at < cur.first)) cur.first = at; }
  }
  const serials = [...bySerial.keys()];
  // "Waiting": the holder has not yet checked this record (no verified event on the delivered document).
  const checked = new Set<string>();
  if (serials.length) {
    const docs = await db.from("documents").select("id, serial").in("serial", serials);
    const ids = (docs.data ?? []) as { id: string; serial: string }[];
    if (ids.length) {
      const ev = await db.from("document_events").select("document_id, state").in("document_id", ids.map((d) => d.id));
      const done = new Set(((ev.data ?? []) as { document_id: string; state: string }[]).filter((e) => e.state === "verified").map((e) => e.document_id));
      for (const d of ids) if (done.has(d.id)) checked.add(d.serial);
    }
  }
  return [...bySerial.values()]
    .map(({ latest, first }): IssuedRow => ({ serial: latest.serial, docType: latest.doc_type, issuedAt: first, status: latest.status, version: latest.version, supersededBy: latest.superseded_by ?? null, waiting: latest.status === "active" && !checked.has(latest.serial) }))
    .sort((a, b) => ((b.issuedAt ?? "") < (a.issuedAt ?? "") ? -1 : 1));
}

export interface Activity { seq: number; kind: string; at: string; serial: string; docType: string | null; by: string | null }

/** The issuer own recent ledger lines (issued, replaced, stopped), newest first. */
export async function issuerActivity(db: Db, issuer: string, limit = 20): Promise<Activity[]> {
  // One query per kind (the database filters by kind), then this issuer lines are picked and merged newest first.
  const rows: { seq: number; kind: string; payload: Record<string, unknown>; created_at: string }[] = [];
  for (const kind of ["issuer.issued", "issuer.superseded", "issuer.revoked"]) {
    const r = await db.from("ledger").select("seq, kind, payload, created_at").eq("kind", kind).order("seq", { ascending: false }).limit(300);
    if (r.error) throw new Error(`ledger unavailable: ${r.error.message}`);
    rows.push(...((r.data ?? []) as typeof rows));
  }
  return rows.filter((l) => l.payload.issuer_name === issuer).sort((a, b) => b.seq - a.seq).slice(0, limit)
    .map((l) => ({ seq: l.seq, kind: l.kind, at: l.created_at, serial: String(l.payload.serial ?? ""), docType: (l.payload.doc_type as string | undefined) ?? null, by: (l.payload.superseded_by as string | undefined) ?? null }));
}
