/**
 * POST /api/upload/document — save a document the student uploaded (a PDF or a photo) into their own vault.
 * Body (JSON): { doc_type, title, issuer?, fields: { name: value }, capture: "digital" | "scan", ocr_confidence?, file: { b64 } }
 *
 * Plain English: the file is checked again here (never trust the browser): real PDF or JPEG/PNG bytes, size cap,
 * no scripts in a PDF. The details the person checked become the document; the original file is kept with it so they
 * can open it again. It goes through the one front door (ingestDocument) and is "uploaded by you, not checked yet":
 * only a check with the issuer can ever mark it verified (a serial number lets that check find the issuer's record).
 * Only the signed-in student can call this (the route is in the student's area); the owner is always their own vault.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestDocument } from "@/lib/ingest";
import { append } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { badRequest, DEMO_OWNER, serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { checkFile, MIME } from "@/lib/upload-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  doc_type: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  title: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional(),
  fields: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), z.string().trim().min(1).max(500)).refine((f) => Object.keys(f).length >= 1 && Object.keys(f).length <= 30, "Add at least one detail (at most 30)."),
  capture: z.enum(["digital", "scan"]),
  ocr_confidence: z.record(z.string(), z.number().min(0).max(1)).optional(),
  file: z.object({ b64: z.string().min(4).max(1_000_000) }),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const b = parsed.data;
  const bytes = new Uint8Array(Buffer.from(b.file.b64, "base64"));
  const check = checkFile(bytes);
  if (!check.ok) {
    log("warn", "upload refused", { problem: check.problem });
    return NextResponse.json({ error: check.reason, problem: check.problem }, { status: check.problem === "too_big" ? 413 : 422 });
  }
  try {
    const telugu = Object.values(b.fields).some((v) => /[ఀ-౿]/.test(v));
    const stored = await ingestDocument(supabase, {
      owner: DEMO_OWNER, doc_type: b.doc_type, title: b.title, issuer: b.issuer || null, serial: b.fields.serial ?? null,
      capture: b.capture, fields: b.fields, ocr_confidence: b.capture === "scan" ? b.ocr_confidence ?? null : null,
      language_scripts: telugu ? ["latin", "telugu"] : ["latin"], synthetic: true,
      original_file: { mime: MIME[check.kind], b64: Buffer.from(bytes).toString("base64") },
    });
    const line = await append(supabase, "document.uploaded", { document_id: stored.id, doc_type: b.doc_type, file_kind: check.kind, fields: Object.keys(b.fields).length });
    return NextResponse.json({ id: stored.id, sha256: stored.sha256, ledger_seq: line.seq }, { status: 201 });
  } catch (e) {
    log("error", "upload failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("save this document");
  }
}
