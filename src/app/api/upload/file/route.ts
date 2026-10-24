/**
 * POST /api/upload/file — the front gate for a PDF upload (raw bytes in the body, Content-Type application/pdf).
 *
 * Plain English: the file is checked by checkUpload() (real PDF bytes, size cap, no active content). A refused file
 * stores nothing and says why in one plain sentence; the log keeps only the reason. A file that passes is NOT turned
 * into a document here: reading a PDF into fields is not built in this prototype (documents enter as structured
 * details or issuer-delivered records), and the answer says so instead of pretending.
 */
import { NextResponse } from "next/server";
import { log } from "@/lib/scrub";
import { checkUpload } from "@/lib/upload-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const bytes = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const r = checkUpload(bytes);
  if (!r.ok) {
    log("warn", "upload refused", { problem: r.problem });
    return NextResponse.json({ error: r.reason, problem: r.problem }, { status: r.problem === "too_big" ? 413 : 422 });
  }
  return NextResponse.json({ ok: true, stored: false, note: "The file passed the safety checks. Turning a PDF into document details is not built in this prototype, so nothing was stored." }, { status: 200 });
}
