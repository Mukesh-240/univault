/**
 * /signin — the SIMULATED Aadhaar-style sign-in (3 big steps; see SignInFlow.tsx).
 * Plain English: nothing here talks to UIDAI, DigiLocker or any government service. The number must be a
 * demo number (starts with 0000, so it can never be a real Aadhaar number); the code is shown on screen.
 * A permanent banner says so. This page is open to everyone; every other page needs a signed-in browser.
 */
import { getI18n } from "@/lib/i18n-server";
import { generate } from "@/lib/synthetic-aadhaar";
import { SignInFlow } from "./SignInFlow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SignInPage() {
  const { t } = await getI18n();
  return (
    <div className="signin-wrap">
      <h1>{t("signin.title")}</h1>
      <p className="signin-banner" role="note">{t("signin.banner")}</p>
      <SignInFlow initialNumber={generate()} />
    </div>
  );
}
