/**
 * POST /api/feedback — the two buttons on every automated result: "Correct / Override" and "Escalate / Dispute".
 *
 * Body: { "target_kind": "...", "target_id": "<id of the result's document or rule>", "action": "override" | "dispute",
 *         "field"?: "<field name>", "value"?: "<corrected value>" }
 *
 *   - Confirming or correcting an OCR field (target_kind "ocr_field", action "override", with field and
 *     value) adds an ASSERTION row: the original stays untouched; the person's value is a separate,
 *     dated claim. Confirming = asserting the same value the OCR read.
 *   - Every override or dispute is recorded as an append-only ledger line. The ledger stores only the
 *     kind, target and field name — never the corrected value or any note text (they may be personal).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { append } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { badRequest, serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const Body = z.object({
  target_kind: z.enum(["readiness_rule", "name_match", "ocr_field", "verification", "injection_flag", "over_broad", "duplicate"]),
  target_id: z.string().min(1).max(120),
  action: z.enum(["override", "dispute"]),
  field: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/).optional(),
  value: z.string().max(500).optional(),
}).refine((b) => b.target_kind !== "ocr_field" || b.action !== "override" || (b.field && b.value !== undefined), "an OCR correction needs field and value");

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { target_kind, target_id, action, field, value } = parsed.data;
  try {
    let assertion = false;
    if (target_kind === "ocr_field" && action === "override") {
      const p = await supabase.from("document_payloads").select("content").eq("document_id", target_id).single();
      if (p.error || !p.data) return NextResponse.json({ error: "Document not found (or its content was erased)." }, { status: 404 });
      const original = (p.data.content as { fields: Record<string, string> }).fields[field!];
      if (original === undefined) return NextResponse.json({ error: "That field is not on this document." }, { status: 422 });
      const ins = await supabase.from("assertions").insert({ document_id: target_id, field, original_value: original, asserted_value: value, author: "user", evidence: value === original ? "confirmed as read" : "corrected by user" });
      if (ins.error) throw new Error(ins.error.message);
      assertion = true;
    }
    await append(supabase, `feedback.${action}`, { target_kind, target_id, field: field ?? null, assertion });
    return NextResponse.json({ recorded: true, action, assertion }, { status: 201 });
  } catch (e) {
    log("error", "feedback failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("record your feedback");
  }
}
