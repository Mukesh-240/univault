/**
 * GET /api/analysis — vault-wide checks that don't belong to one purpose:
 *   duplicates (exact / near / rescan / same serial with different content),
 *   date-of-birth consistency across documents (date styles normalised first),
 *   injection warnings (instruction-like text, invisible characters, hidden text — treated as data),
 *   OCR review hints (fields to check first before confirming a scan).
 */
import { NextResponse } from "next/server";
import { dobConsistency, findDuplicates } from "@/lib/duplicates";
import { explain } from "@/lib/explain";
import { scanDocument } from "@/lib/injection";
import { reviewHints } from "@/lib/ocr";
import { log } from "@/lib/scrub";
import { loadDemoVault, serverError } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await loadDemoVault();
    const injection = ctx.docs.map((d) => ({ documentId: d.id, ...scanDocument(d) })).filter((s) => s.suspected).map((s) => ({
      ...s, explanation: explain({ reason: `Treated as data, never as instructions: ${s.hits.join("; ")}.`, confidence: { kind: "evidence", value: "weaker" }, source: { name: "UNIVAULT injection detector (phrase + invisible-character + hidden-text checks)", freshness: "n/a" }, documentIds: [s.documentId] }),
    }));
    const ocr = ctx.docs.map((d) => ({ documentId: d.id, hints: reviewHints(d) })).filter((o) => o.hints.length);
    return NextResponse.json({ duplicates: findDuplicates(ctx.docs), dob: dobConsistency(ctx.docs), injection, ocr });
  } catch (e) {
    log("error", "analysis failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("analyse the vault");
  }
}
