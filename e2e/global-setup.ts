/**
 * PLAYWRIGHT GLOBAL SETUP — sign in once, so every browser test starts as a signed-in person.
 *
 * Plain English: before the tests run, this makes a demo number, asks the app for a code (the code is
 * shown in the reply: it is a simulation), checks it, presses "Allow", and saves the resulting session
 * cookie to e2e-results/auth.json. playwright.config.ts hands that file to every test. The sign-in tests
 * themselves start with no cookies (see e2e/signin.e2e.ts) and go through the real screens.
 */
import { request, type FullConfig } from "@playwright/test";
import { generate } from "../src/lib/synthetic-aadhaar";

export const AUTH_FILE = "e2e-results/auth.json"; // the sender (the default for every test)
export const ISSUER_AUTH = "e2e-results/auth-issuer.json";
export const RECEIVER_AUTH = "e2e-results/auth-receiver.json";

/** Sign in as one role through the real API (the default profile of that role) and save the cookies. */
async function signIn(baseURL: string | undefined, role: "issuer" | "sender" | "receiver", file: string, ref?: string) {
  const api = await request.newContext({ baseURL });
  const number = generate();
  const asked = await api.post("/api/auth/code", { data: { number, role, ref } });
  if (!asked.ok()) throw new Error(`sign-in (${role}): code request failed (${asked.status()})`);
  const { code } = (await asked.json()) as { code: string };
  const checked = await api.post("/api/auth/verify", { data: { number, code } });
  if (!checked.ok()) throw new Error(`sign-in (${role}): code check failed (${checked.status()})`);
  const allowed = await api.post("/api/auth/allow", { data: {} });
  if (!allowed.ok()) throw new Error(`sign-in (${role}): allow failed (${allowed.status()})`);
  await api.storageState({ path: file });
  await api.dispose();
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  await signIn(baseURL, "sender", AUTH_FILE);
  // The university issues degree certificates (the kind the purpose packs ask about), so the journeys can share what it issues.
  await signIn(baseURL, "issuer", ISSUER_AUTH, "Synthetic State University");
  await signIn(baseURL, "receiver", RECEIVER_AUTH);
}
