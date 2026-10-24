/**
 * POST /api/requests/check — is a recipient asking for more than its purpose needs?
 * Body: { "recipient_code": "UV-R-1234", "purpose": "scholarship", "requested": ["id_card.id_number", ...] }
 *
 * The recipient's registered purpose comes from the recipients table (never from the request itself),
 * so a request can't widen what it is allowed by claiming a different purpose. The check result is
 * recorded in the ledger (counts only, no values).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { append } from "@/lib/ledger";
import { checkRequest } from "@/lib/overbroad";
import { loadPacks } from "@/lib/rules";
import { log } from "@/lib/scrub";
import { badRequest, serverError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const Body = z.object({
  recipient_code: z.string().regex(/^UV-R-\d{3,6}$/),
  purpose: z.string().min(1).max(60),
  requested: z.array(z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/)).min(1).max(40),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { recipient_code, purpose, requested } = parsed.data;
  try {
    const rec = await supabase.from("recipients").select("recipient_code, name, org").eq("recipient_code", recipient_code).single();
    if (rec.error || !rec.data) return NextResponse.json({ error: "Unknown recipient." }, { status: 404 });
    const result = checkRequest({ recipient_purpose: rec.data.org as string, purpose, requested }, loadPacks());
    await append(supabase, "request.checked", { recipient_code, flagged: result.flagged, extra_count: result.extra.length, purpose_mismatch: result.purposeMismatch });
    return NextResponse.json({ recipient: { code: rec.data.recipient_code, name: rec.data.name, purpose: rec.data.org }, ...result });
  } catch (e) {
    log("error", "request check failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("check this request");
  }
}
