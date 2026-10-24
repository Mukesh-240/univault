/**
 * POST /api/upload — a person adds a document to their vault.
 *
 * Plain-English picture:
 *   This simply hands the document to ingestDocument() — the SAME function the synthetic seed data
 *   uses — so uploads and demo data are treated identically. If the document is malformed, the
 *   person gets a plain list of what is wrong and nothing is stored. Error messages never repeat
 *   the document's contents.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ingestDocument } from "@/lib/ingest";
import { log } from "@/lib/scrub";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => undefined);
  try {
    const result = await ingestDocument(supabase, body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) {
      // Which parts were wrong, by field path only (e.g. "fields.Bad Key: field names must be lower_snake_case").
      const problems = e.issues.map((i) => `${i.path.join(".") || "document"}: ${i.message}`);
      log("warn", "upload rejected as malformed", { problems: problems.length });
      return NextResponse.json({ error: "The document was not accepted. Nothing was stored.", problems }, { status: 400 });
    }
    log("error", "upload failed", { message: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "The vault could not store this document right now. Nothing was shared." }, { status: 500 });
  }
}
