/**
 * DEMO PROFILES — the people and organisations you can sign in as, read from the database.
 *
 * Plain-English picture:
 *   The sign-in screen offers "demo profiles". They are not typed in here: they come from the demo cast
 *   (src/config/demo-cast.json): the ISSUERS (VIT, Government), the SENDER (the student who owns the vault) and the
 *   RECEIVERS (Google). A cast receiver that is not in the recipients table yet is added once (so an emptied
 *   database still works), and any other recipients in the table are offered too. Each profile gets a demo number (starts 0000, Verhoeff check digit)
 *   worked out from a fixed key, so the same profile always shows the same masked number. Nothing here looks
 *   at the synthetic flag, a person, or a serial number.
 *   A role + ref pair is what goes in the session: ref is the issuer's name, the vault owner id, or the
 *   recipient code. The server re-checks a ref against this list before it signs anyone in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import cast from "../config/demo-cast.json";
import { accountInfo, type AccountType } from "./accounts";
import { sha256 } from "./crypto";
import type { Role } from "./session";
import { generate } from "./synthetic-aadhaar";
import { DEMO_OWNER } from "./server";

export interface Profile { role: Role; ref: string; name: string; number: string; uvId: string; type: AccountType; category?: string }

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
    for (const n of cast.issuers.map((i) => i.name)) { const a = accountInfo("issuer", n); out.push({ role: "issuer", ref: n, name: n, number: demoNumberFor(`issuer|${n}`), uvId: a.uvId, type: a.type, category: a.category }); }
    { const a = accountInfo("sender", DEMO_OWNER); out.push({ role: "sender", ref: DEMO_OWNER, name: cast.sender.name, number: demoNumberFor(`holder|${DEMO_OWNER}`), uvId: a.uvId, type: a.type }); }
    await ensureCastReceivers(db);
    const rec = await db.from("recipients").select("recipient_code, name, org").order("recipient_code");
    for (const r of (rec.data ?? []) as { recipient_code: string; name: string; org: string }[]) {
      const a = accountInfo("receiver", r.recipient_code, r.org);
      out.push({ role: "receiver", ref: r.recipient_code, name: r.name, number: demoNumberFor(`receiver|${r.recipient_code}`), uvId: a.uvId, type: a.type });
    }
  } catch { /* an empty list; the sign-in page explains */ }
  return out;
}

/** Add the cast's receivers (Google) to the recipients table if they are missing. Insert-only (the table is append-only). */
async function ensureCastReceivers(db: Db) {
  const have = await db.from("recipients").select("recipient_code").in("recipient_code", cast.receivers.map((r) => r.code));
  const known = new Set(((have.data ?? []) as { recipient_code: string }[]).map((r) => r.recipient_code));
  const missing = cast.receivers.filter((r) => !known.has(r.code));
  if (missing.length) await db.from("recipients").insert(missing.map((r) => ({ recipient_code: r.code, name: r.name, org: r.purpose })));
}

/** The profile a role + ref names, or null (the server never trusts a ref it cannot find here). */
export const findProfile = (list: Profile[], role: Role, ref: string) => list.find((p) => p.role === role && p.ref === ref) ?? null;
