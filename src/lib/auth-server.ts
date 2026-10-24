/**
 * AUTH (server helpers) — read the signed-in person's session cookie inside pages and routes.
 * The cookie format and signing live in session.ts; this file only adds "get the secret" and "read it".
 */
import { cookies } from "next/headers";
import { open, SESSION_COOKIE, type SessionPayload } from "./session";

/** The signing secret: the vault's existing private key (no new secret is needed). Null if it is not set. */
export const sessionSecret = (): string | null => process.env.VAULT_PRIVATE_KEY || null;

/** The signed-in person's session, or null when there is none (or it is forged or has ended). */
export async function currentSession(): Promise<SessionPayload | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  return open<SessionPayload>((await cookies()).get(SESSION_COOKIE)?.value, "session", secret);
}

/** The recipient code of a signed-in RECEIVER (null for anyone else, who therefore has no inbox). */
export const receiverCode = (s: SessionPayload | null): string | null => (s?.role === "receiver" && s.ref ? s.ref : null);
