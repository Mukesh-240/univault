/**
 * POST /api/share/confirm — the ONLY way a share can ever be created.
 * Body: { "draft": <exactly the previewed draft>, "preview_token": "<token from /api/share/preview>" }
 *
 * The server checks the token (genuine, not expired, draft unchanged since the preview). Without a
 * valid token nothing happens — so no document text, assistant card or other code path can create a
 * share. Creating the share rows, recipient tokens and receipt is built in Phase 4; until then a valid
 * confirmation is acknowledged but no share exists yet (and the answer says so).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkConfirmation, ShareDraftSchema } from "@/lib/consent";
import { badRequest, serverKey } from "@/lib/server";

export const dynamic = "force-dynamic";

const Body = z.object({ draft: ShareDraftSchema, preview_token: z.string().max(2000).optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const check = checkConfirmation(parsed.data.draft, parsed.data.preview_token, serverKey("VAULT_PUBLIC_KEY"), new Date());
  if (!check.ok) return NextResponse.json({ error: check.reason, shared: false }, { status: 403 });
  return NextResponse.json({ confirmed: true, shared: false, note: "Confirmation accepted. Share creation (tokens, receipt) arrives in Phase 4; nothing has been shared." }, { status: 501 });
}
