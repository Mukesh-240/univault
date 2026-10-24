/**
 * GET  /api/names — every pair of documents, best name match first, with reasons. Never merges.
 * POST /api/names — the person's decision about one pair:
 *        { "doc_a": "<uuid>", "doc_b": "<uuid>", "decision": "confirmed_same_person" | "rejected" }
 *      The score and reasons stored with the decision are recomputed here on the server (never taken
 *      from the browser). The decision is a new append-only row + a ledger line; it can be changed
 *      later only by adding another decision.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { append } from "@/lib/ledger";
import { candidatePairs } from "@/lib/resolution";
import { log } from "@/lib/scrub";
import { badRequest, loadDemoVault, serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await loadDemoVault();
    return NextResponse.json({ pairs: candidatePairs(ctx.docs, ctx.links), autoMerge: false });
  } catch (e) {
    log("error", "names failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("compare names");
  }
}

const Body = z.object({ doc_a: z.string().uuid(), doc_b: z.string().uuid(), decision: z.enum(["confirmed_same_person", "rejected"]) })
  .refine((b) => b.doc_a !== b.doc_b, "choose two different documents");

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { doc_a, doc_b, decision } = parsed.data;
  try {
    const ctx = await loadDemoVault();
    const pair = candidatePairs(ctx.docs.filter((d) => d.id === doc_a || d.id === doc_b))[0];
    if (!pair) return NextResponse.json({ error: "Both documents must be in your vault and have a name." }, { status: 404 });
    const ins = await supabase.from("entity_links").insert({ doc_a, doc_b, decision, score: pair.score, explanation: { verdict: pair.verdict, explanations: pair.explanations } });
    if (ins.error) throw new Error(ins.error.message);
    await append(supabase, "entity_link.decision", { doc_a, doc_b, decision, score: pair.score, verdict: pair.verdict });
    return NextResponse.json({ recorded: true, decision, score: pair.score, verdict: pair.verdict }, { status: 201 });
  } catch (e) {
    log("error", "name decision failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("record this decision");
  }
}
