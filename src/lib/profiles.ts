/**
 * DEMO PROFILES — the people and organisations you can sign in as, read from the database.
 *
 * Plain-English picture:
 *   The sign-in screen offers "demo profiles". They are not typed in here: the ISSUERS are the distinct issuer
 *   names in the registry, the SENDER is the owner of the vault (named from the identity card), and the RECEIVERS
 *   are the rows of the recipients table. Each profile gets a demo number (starts 0000, Verhoeff check digit)
 *   worked out from a fixed key, so the same profile always shows the same masked number. Nothing here looks
 *   at the synthetic flag, a person, or a serial number.
 *   A role + ref pair is what goes in the session: ref is the issuer's name, the vault owner id, or the
 *   recipient code. The server re-checks a ref against this list before it signs anyone in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "./crypto";
import { personRecord } from "./person";
import type { Role } from "./session";
import { generate } from "./synthetic-aadhaar";
import { DEMO_OWNER, loadDemoVault } from "./server";

export interface Profile { role: Role; ref: string; name: string; number: string }

/** A demo number worked out from a key: 0000 + 7 digits taken from the key's hash + the check digit. */
export function demoNumberFor(key: string): string {
  const h = sha256(`demo-profile|${key}`);
  return generate((n) => Array.from({ length: n }, (_, i) => String(parseInt(h[i * 2] + h[i * 2 + 1], 16) % 10)).join(""));
}

type Db = Pick<SupabaseClient, "from">;

// The sign-in screen and the sign-in routes both ask for the list; reading a whole vault for one name each time is
// wasteful, so the list is kept for 30 seconds per server instance (names never change: documents are immutable).
const TTL_MS = 30_000;
let cached: { at: number; list: Profile[] } | null = null;

/** All profiles, issuers first. If the database cannot be read the list is simply empty (the chooser says so). */
export async function loadProfiles(db: Db): Promise<Profile[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.list;
  const list = await readProfiles(db);
  if (list.length) cached = { at: Date.now(), list };
  return list;
}

async function readProfiles(db: Db): Promise<Profile[]> {
  const out: Profile[] = [];
  try {
    const reg = await db.from("issuer_registry").select("issuer_name");
    const names = [...new Set(((reg.data ?? []) as { issuer_name: string }[]).map((r) => r.issuer_name).filter(Boolean))].sort();
    for (const n of names) out.push({ role: "issuer", ref: n, name: n, number: demoNumberFor(`issuer|${n}`) });
    const person = personRecord((await loadDemoVault()).docs);
    out.push({ role: "sender", ref: DEMO_OWNER, name: person.name ?? "Demo holder", number: demoNumberFor(`holder|${DEMO_OWNER}`) });
    const rec = await db.from("recipients").select("recipient_code, name").order("recipient_code");
    for (const r of (rec.data ?? []) as { recipient_code: string; name: string }[])
      out.push({ role: "receiver", ref: r.recipient_code, name: r.name, number: demoNumberFor(`receiver|${r.recipient_code}`) });
  } catch { /* an empty list; the sign-in page explains */ }
  return out;
}

/** The profile a role + ref names, or null (the server never trusts a ref it cannot find here). */
export const findProfile = (list: Profile[], role: Role, ref: string) => list.find((p) => p.role === role && p.ref === ref) ?? null;
