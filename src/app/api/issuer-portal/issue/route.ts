/**
 * POST /api/issuer-portal/issue — an issuer signs and issues a document to a holder.
 * Body: { holder_ref, doc_type, answers: { box: value }, supersedes?: serial }
 *
 * Plain English: only a signed-in ISSUER may call this (the gate refuses everyone else). The issuer identity comes
 * from the signed session, never from the request. The details are checked again here, the record is signed with the
 * server-held issuer key, added to the registry, and the document is delivered to the holder through the normal
 * ingest path. A corrected copy (supersedes) also marks the old record as replaced.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession } from "@/lib/auth-server";
import { issueDocument } from "@/lib/issuer-portal";
import { findProfile, loadProfiles } from "@/lib/profiles";
import { log } from "@/lib/scrub";
import { badRequest, serverError, serverKey } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  holder_ref: z.string().min(1).max(200),
  doc_type: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  answers: z.record(z.string().max(60), z.string().max(200)),
  supersedes: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const session = await currentSession();
  if (session?.role !== "issuer" || !session.ref) return NextResponse.json({ error: "Only an issuer can do this." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const holder = findProfile(await loadProfiles(supabase), "sender", parsed.data.holder_ref);
    if (!holder) return NextResponse.json({ error: "We could not find that person." }, { status: 404 });
    const r = await issueDocument(supabase, {
      issuer: session.ref, holderOwner: holder.ref, docType: parsed.data.doc_type, answers: parsed.data.answers, supersedes: parsed.data.supersedes,
    }, serverKey("ISSUER_PRIVATE_KEY"));
    if (!r.ok) return NextResponse.json({ error: r.error, problems: r.problems }, { status: r.status });
    // The extra facts feed the on-screen step trail (what ran, with its ledger line); no value from the document is sent back.
    return NextResponse.json({ ok: true, serial: r.serial, documentId: r.documentId, trail: { serial: r.serial, fieldCount: r.fieldCount, salted: r.salted, ledgerSeq: r.ledgerSeq, sha256: r.sha256 } }, { status: 201 });
  } catch (e) {
    log("error", "issue failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("issue this document");
  }
}
