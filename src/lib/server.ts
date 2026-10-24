/**
 * SERVER HELPERS — small shared pieces for the API routes (server-side only).
 *
 *   serverKey()      reads a signing key from .env.local and fails loudly if it is missing.
 *   loadDemoVault()  loads the demo vault and re-labels any verification older than 24 h as stale.
 *   DEMO_OWNER       this prototype has no login; every route works on the one demo vault
 *                    (stated as a demo-mode limit in the threat model).
 *   badRequest()     a uniform "your request was malformed" answer that never echoes the input.
 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { todayIso } from "./dates";
import { supabase } from "./supabase";
import { loadVault, type EngineContext } from "./vault";
import { withFreshness } from "./verify";

export const DEMO_OWNER = "demo";

type KeyName = "ISSUER_PUBLIC_KEY" | "VAULT_PRIVATE_KEY" | "VAULT_PUBLIC_KEY";
export function serverKey(name: KeyName): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (server-only key; see UNIVAULT_SPEC.md section 12).`);
  return v;
}

export async function loadDemoVault(now = new Date()): Promise<EngineContext> {
  const ctx = await loadVault(supabase, DEMO_OWNER, todayIso(now));
  const verification: EngineContext["verification"] = {};
  for (const [id, v] of Object.entries(ctx.verification)) verification[id] = v ? withFreshness(v, now) : v;
  return { ...ctx, verification };
}

export const badRequest = (e: ZodError) =>
  NextResponse.json({ error: "The request was not accepted.", problems: e.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`) }, { status: 400 });

export const serverError = (what: string) =>
  NextResponse.json({ error: `Could not ${what} right now. Nothing was changed.` }, { status: 500 });
