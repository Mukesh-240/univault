/**
 * /signin — the SIMULATED Aadhaar-style sign-in: a hero with three role cards, demo profiles, a code shown on
 * screen, and a consent card (see SignInFlow.tsx).
 * Plain English: nothing here talks to UIDAI, DigiLocker or any government service. A number must be a demo
 * number (starts with 0000, so it can never be a real Aadhaar number); the code is shown on screen. One calm
 * line at the bottom says so. This page is open to everyone; the rest of the app needs a signed-in browser.
 */
import { HeroArt } from "@/components/HeroArt";
import { getI18n } from "@/lib/i18n-server";
import { loadProfiles } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { format, generate, mask } from "@/lib/synthetic-aadhaar";
import { SignInFlow } from "./SignInFlow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SignInPage() {
  const { t } = await getI18n();
  const profiles = (await loadProfiles(supabase)).map((p) => ({ role: p.role, ref: p.ref, name: p.name, number: format(p.number), masked: mask(p.number) }));
  return (
    <div className="signin-page">
      <div className="signin-main">
        <h1>{t("signin.hero.title")}</h1>
        <p className="lead">{t("signin.hero.sub")}</p>
        <SignInFlow profiles={profiles} initialNumber={generate()} />
      </div>
      <HeroArt />
      <p className="signin-foot" role="note">{t("signin.footer")}</p>
    </div>
  );
}
