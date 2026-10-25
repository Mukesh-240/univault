/**
 * UPLOAD CHECK — decides whether a file is acceptable BEFORE anything is stored: a PDF, or a photo (JPEG or PNG).
 *
 * Plain-English picture: a file is accepted only if (1) it is not empty, (2) it is not bigger than the cap, (3) its
 * first bytes really say it is a PDF or a JPEG/PNG photo (the file NAME is never trusted: a renamed .exe is refused), and
 * (4) a PDF carries no "active content" (embedded JavaScript, launch actions, embedded files). Phone photos are made
 * smaller in the browser before they are sent, so they fit the cap. A refused file stores nothing and the person
 * gets one plain reason; the log line names the reason only, never the file name or contents.
 * Text hidden inside a PDF is a different matter: it is data, never an instruction (see injection.ts), so a PDF that
 * carries it is still accepted and simply cannot create or change anything.
 */
export const MAX_UPLOAD_BYTES = 700 * 1024; // below the 1 MB request cap middleware.ts allows on the upload routes

export type UploadProblem = "empty" | "too_big" | "not_pdf" | "active_content" | "not_supported";
export type FileKind = "pdf" | "jpeg" | "png";
export type UploadCheck = { ok: true; kind: FileKind } | { ok: false; problem: UploadProblem; reason: string };
export const MIME: Record<FileKind, string> = { pdf: "application/pdf", jpeg: "image/jpeg", png: "image/png" };

const REASONS: Record<UploadProblem, string> = {
  empty: "The file is empty. Nothing was stored.",
  too_big: "The file is too big (the limit is 700 KB in this demo). Take a photo instead, or save a smaller PDF. Nothing was stored.",
  not_pdf: "Only PDF files can be added. This file is not a PDF. Nothing was stored.",
  active_content: "This PDF contains active content (such as a script), which is not allowed. Nothing was stored.",
  not_supported: "Only a PDF or a photo (JPEG or PNG) can be added. Nothing was stored.",
};

// PDF names for actions that can run code or launch something; matched as whole PDF names (followed by a non-name byte).
const ACTIVE = /\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|EmbeddedFiles|RichMedia|SubmitForm)(?![A-Za-z0-9])/;

export function checkUpload(bytes: Uint8Array): UploadCheck {
  const fail = (problem: UploadProblem): UploadCheck => ({ ok: false, problem, reason: REASONS[problem] });
  if (bytes.length === 0) return fail("empty");
  if (bytes.length > MAX_UPLOAD_BYTES) return fail("too_big");
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head !== "%PDF-") return fail("not_pdf");
  if (ACTIVE.test(Buffer.from(bytes).toString("latin1"))) return fail("active_content");
  return { ok: true, kind: "pdf" };
}

/** A PDF (checked as above) or a photo, recognised by its first bytes. */
export function checkFile(bytes: Uint8Array): UploadCheck {
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return sizeOk(bytes, "jpeg");
  if (bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return sizeOk(bytes, "png");
  const pdf = checkUpload(bytes);
  if (!pdf.ok && pdf.problem === "not_pdf") return { ok: false, problem: "not_supported", reason: REASONS.not_supported };
  return pdf;
}
const sizeOk = (bytes: Uint8Array, kind: FileKind): UploadCheck =>
  bytes.length > MAX_UPLOAD_BYTES ? { ok: false, problem: "too_big", reason: REASONS.too_big } : { ok: true, kind };
