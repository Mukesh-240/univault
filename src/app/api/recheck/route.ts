/**
 * POST /api/recheck — issuer re-check (spec F20): re-verify every document used by an ACTIVE share.
 * When a record has become superseded or revoked (or no longer matches), list every active share that
 * used it and notify the owner (a "recheck.affected" ledger line feeds the bell). Nothing is revoked
 * automatically: the owner decides. The shares page calls this from its button and every 60 s.
 */
import { NextResponse } from "next/server";
import { append } from "@/lib/ledger";
import { log } from "@/lib/scrub";
import { DEMO_OWNER, serverError, serverKey } from "@/lib/server";
import { loadShares } from "@/lib/share-store";
import { BLOCKING_STATES } from "@/lib/shares";
import { supabase } from "@/lib/supabase";
import { runVerification } from "@/lib/verify-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const active = (await loadShares(supabase, DEMO_OWNER)).filter((s) => s.state === "active");
    const docIds = [...new Set(active.flatMap((s) => s.snapshot.docs.filter((d) => d.state !== "no_serial").map((d) => d.id)))];
    const affected = [];
    for (const id of docIds) {
      const r = await runVerification(supabase, id, serverKey("ISSUER_PUBLIC_KEY"));
      if (!r.ok || !BLOCKING_STATES.includes(r.outcome.state)) continue;
      const shares = active.filter((s) => s.snapshot.docs.some((d) => d.id === id)).map((s) => ({ id: s.id, recipient: s.recipientCode, purpose: s.purpose }));
      const title = active.flatMap((s) => s.snapshot.docs).find((d) => d.id === id)?.title ?? "";
      await append(supabase, "recheck.affected", { document_id: id, title, state: r.outcome.state, share_ids: shares.map((s) => s.id) });
      affected.push({ document_id: id, title, state: r.outcome.state, reason: r.outcome.reason, shares });
    }
    return NextResponse.json({ checked: docIds.length, affected, checked_at: new Date().toISOString() });
  } catch (e) {
    log("error", "recheck failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("re-check the issuers");
  }
}
