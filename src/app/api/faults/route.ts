/**
 * /api/faults — the fault-injection panel's server side (spec F14). DEMO TOOL: every action is recorded
 * as a ledger line, and nothing here can create or confirm a share.
 *
 * GET  -> current switches and row counts (so the panel can prove "nothing was stored").
 * POST { fault: "issuer_timeout", on }      the simulated issuer stalls past the 8 s limit (issuer_config.is_down)
 * POST { fault: "stale_data", on }          verifications made before now are treated as > 24 h old
 * POST { fault: "conflicting_update", document_id, field, value }
 *      the simulated issuer publishes a NEW signed version of that document's record with one field
 *      changed (a new append-only registry row; old versions stay). Verifying the document then shows
 *      "the issuer has published an updated record ... changed: <field>".
 * (Malformed upload: the panel sends a broken document to the normal POST /api/upload.
 *  Connectivity loss: lives in the browser; no request can reach the server while "offline".)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { setStale, faultState } from "@/lib/faults";
import { issueEntry } from "@/lib/issuer";
import { append } from "@/lib/ledger";
import { fromRow, toRow } from "@/lib/registry";
import { log } from "@/lib/scrub";
import { badRequest, serverError, serverKey } from "@/lib/server";
import { OFFLINE, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const count = async (table: string) => (await supabase.from(table).select("*", { count: "exact", head: true })).count ?? 0;

export async function GET() {
  try {
    const cfg = await supabase.from("issuer_config").select("is_down").eq("id", 1).single();
    const [documents, ledger, shares, registry] = await Promise.all(["documents", "ledger", "shares", "issuer_registry"].map(count));
    return NextResponse.json({
      issuer_down: Boolean((cfg.data as { is_down?: boolean } | null)?.is_down), stale_since: faultState().staleSince,
      offline_store: OFFLINE, counts: { documents, ledger, shares, registry },
    });
  } catch (e) {
    log("error", "faults read failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("read the fault switches");
  }
}

const Body = z.discriminatedUnion("fault", [
  z.object({ fault: z.literal("issuer_timeout"), on: z.boolean() }),
  z.object({ fault: z.literal("stale_data"), on: z.boolean() }),
  z.object({ fault: z.literal("conflicting_update"), document_id: z.string().uuid(), field: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), value: z.string().min(1).max(500) }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const b = parsed.data;
  try {
    if (b.fault === "issuer_timeout") {
      const r = await supabase.from("issuer_config").update({ is_down: b.on, updated_at: new Date().toISOString() }).eq("id", 1);
      if (r.error) throw new Error(r.error.message);
    } else if (b.fault === "stale_data") {
      setStale(b.on);
    } else {
      const res = await conflictingUpdate(b.document_id, b.field, b.value);
      if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
      await append(supabase, "fault.conflicting_update", { document_id: b.document_id, field: b.field, new_version: res.version });
      return NextResponse.json({ applied: true, fault: b.fault, new_version: res.version });
    }
    await append(supabase, `fault.${b.fault}`, { on: b.on });
    return NextResponse.json({ applied: true, fault: b.fault, on: b.on });
  } catch (e) {
    log("error", "fault switch failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("change this fault switch");
  }
}

/** The simulated issuer re-issues the document's record as a new version with one field changed. */
async function conflictingUpdate(documentId: string, field: string, value: string): Promise<{ version: number } | { error: string; status: number }> {
  const doc = await supabase.from("documents").select("serial, doc_type, issuer, document_payloads(content)").eq("id", documentId).single();
  if (doc.error || !doc.data) return { error: "Document not found.", status: 404 };
  const d = doc.data as { serial: string | null; doc_type: string; issuer: string | null; document_payloads: { content: { fields: Record<string, string> } }[] };
  const fields = d.document_payloads[0]?.content.fields;
  if (!d.serial || !fields) return { error: "This document has no issuer record to update.", status: 422 };
  if (!(field in fields)) return { error: "That field is not on this document.", status: 422 };
  const rows = await supabase.from("issuer_registry").select("*").eq("serial", d.serial).order("version", { ascending: false });
  if (rows.error) throw new Error(rows.error.message);
  const latest = (rows.data ?? []).map((r) => fromRow(r as Record<string, unknown>))[0];
  if (!latest) return { error: "The simulated issuer has no record for this serial number.", status: 422 };
  const entry = issueEntry({ ...fields, [field]: value }, { serial: d.serial, doc_type: d.doc_type, issuer_name: latest.issuer_name, version: latest.version + 1 }, serverKey("ISSUER_PRIVATE_KEY"));
  const ins = await supabase.from("issuer_registry").insert(toRow(entry));
  if (ins.error) throw new Error(ins.error.message);
  return { version: entry.version };
}
