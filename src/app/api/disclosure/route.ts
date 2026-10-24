/**
 * POST /api/disclosure — selective disclosure helpers (SD-JWT-style; a signed ATTESTATION, not zero-knowledge).
 *
 *   { "action": "preview", "approved": ["degree_certificate.degree", "id_card.over_18", ...] }
 *       -> exactly what the recipient would see (recipient-view preview). Nothing is shared.
 *   { "action": "verify", "credential": { payload, signature, disclosures } }
 *       -> the recipient's check: is UNIVAULT's signature genuine and does every revealed value match?
 *
 * Issuing a credential happens only when a share is confirmed (Phase 4, behind the consent token).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { recipientView, verifyPresentation, type SdCredential } from "@/lib/disclosure";
import { log } from "@/lib/scrub";
import { badRequest, loadDemoVault, serverError, serverKey } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), approved: z.array(z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/)).min(1).max(40) }),
  z.object({ action: z.literal("verify"), credential: z.object({
    payload: z.object({ iss: z.string(), kind: z.literal("sd-jwt-style"), iat: z.string(), statement: z.string(), _sd: z.array(z.string()), attestations: z.record(z.string(), z.boolean()) }),
    signature: z.string(), disclosures: z.array(z.string()).max(100),
  }) }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    if (parsed.data.action === "verify") return NextResponse.json(verifyPresentation(parsed.data.credential as SdCredential, serverKey("VAULT_PUBLIC_KEY")));
    return NextResponse.json(recipientView(await loadDemoVault(), parsed.data.approved));
  } catch (e) {
    log("error", "disclosure failed", { message: e instanceof Error ? e.message : "unknown" });
    return serverError("prepare the recipient view");
  }
}
