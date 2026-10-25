/**
 * POST /api/upload/read — read the text of an uploaded PDF so the person can check its details before saving.
 * Body: the raw PDF bytes (Content-Type application/pdf). Nothing is stored here.
 *
 * Plain English: the file must pass the same safety check as every upload (real PDF bytes, size cap, no scripts).
 * Then the PDF's own text layer is read (unpdf, server side) and turned into "Label: value" details (read-fields.ts).
 * A scanned PDF has no text layer: the answer says so, and the person can take a photo instead or type the details.
 * The text is DATA: it can never create, share or change anything (see injection.ts).
 */
import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { readFields } from "@/lib/read-fields";
import { log } from "@/lib/scrub";
import { checkUpload } from "@/lib/upload-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const bytes = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const check = checkUpload(bytes);
  if (!check.ok) {
    log("warn", "upload refused", { problem: check.problem });
    return NextResponse.json({ error: check.reason, problem: check.problem }, { status: check.problem === "too_big" ? 413 : 422 });
  }
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 400).map((t) => ({ text: t }));
    return NextResponse.json({ pages: totalPages, lines: lines.map((l) => l.text), fields: readFields(lines), hasText: lines.length > 0 });
  } catch {
    log("warn", "pdf read failed", {});
    return NextResponse.json({ error: "This PDF could not be read. Take a photo of the document instead, or type its details." }, { status: 422 });
  }
}
