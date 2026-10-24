/**
 * UPLOAD CHECK — decides whether a file is acceptable BEFORE anything is stored: it must be a PDF.
 *
 * Plain-English picture: a file is accepted only if (1) it is not empty, (2) it is not bigger than the cap, (3) its
 * first bytes really say it is a PDF (the file NAME is never trusted: a renamed .exe is refused), and (4) it carries no
 * "active content" (embedded JavaScript, launch actions, embedded files). A refused file stores nothing and the person
 * gets one plain reason; the log line names the reason only, never the file name or contents.
 * Text hidden inside a PDF is a different matter: it is data, never an instruction (see injection.ts), so a PDF that
 * carries it is still accepted and simply cannot create or change anything.
 */
export const MAX_UPLOAD_BYTES = 200 * 1024; // below the 256 KB request cap in middleware.ts

export type UploadProblem = "empty" | "too_big" | "not_pdf" | "active_content";
export type UploadCheck = { ok: true } | { ok: false; problem: UploadProblem; reason: string };

const REASONS: Record<UploadProblem, string> = {
  empty: "The file is empty. Nothing was stored.",
  too_big: "The file is too big (the limit is 200 KB in this demo). Nothing was stored.",
  not_pdf: "Only PDF files can be added. This file is not a PDF. Nothing was stored.",
  active_content: "This PDF contains active content (such as a script), which is not allowed. Nothing was stored.",
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
  return { ok: true };
}
