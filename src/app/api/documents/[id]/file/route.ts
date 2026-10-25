/**
 * GET /api/documents/<id>/file — the original file the student uploaded (PDF or photo), for the student only.
 *
 * Plain English: only documents in the signed-in student's own vault are served (the route is in the student's area,
 * and the owner is checked again here). The file opens in the browser; it is never cached by a shared cache.
 * A document whose content was erased has no file any more.
 */
import { NextResponse } from "next/server";
import { DEMO_OWNER } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const doc = await supabase.from("documents").select("owner").eq("id", id);
  if ((doc.data?.[0] as { owner?: string } | undefined)?.owner !== DEMO_OWNER) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const pay = await supabase.from("document_payloads").select("content").eq("document_id", id);
  const file = ((pay.data?.[0] as { content?: { original_file?: { mime: string; b64: string } } } | undefined)?.content)?.original_file;
  if (!file) return NextResponse.json({ error: "There is no original file for this document." }, { status: 404 });
  return new NextResponse(Buffer.from(file.b64, "base64"), {
    headers: { "content-type": file.mime, "content-disposition": "inline", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
