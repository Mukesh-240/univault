/**
 * /signin — the SIMULATED Aadhaar-style sign-in, as a split screen:
 *   left   the brand: logo, the promise in one line, three proof lines, and the demo note;
 *   right  a 420 px column: "Sign in to the demo", the role list, Continue, then the code and consent steps in the
 *          same place (SignInFlow.tsx), with a small footer (Threat model, Policies, Text size, Help).
 * On phones the brand becomes a short strip above the form. Nothing here talks to UIDAI, DigiLocker or any government
 * service: a number must be a demo number (starts with 0000) and the code is shown on screen.
 */
import { BadgeCheck, Eye, Lock } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { DisplayMenu } from "@/components/DisplayMenu";
import { HelpPanel } from "@/components/HelpPanel";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { getI18n } from "@/lib/i18n-server";
import { CONTRAST_COOKIE, parseContrast, parseSize, SIZE_COOKIE } from "@/lib/prefs";
import { loadProfiles } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import { format, generate, mask } from "@/lib/synthetic-aadhaar";
import { SignInFlow } from "./SignInFlow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROOFS = [["signin.proof.1", Lock], ["signin.proof.2", BadgeCheck], ["signin.proof.3", Eye]] as const;

export default async function SignInPage() {
  const { t } = await getI18n();
  const jar = await cookies();
  const profiles = (await loadProfiles(supabase)).map((p) => ({ role: p.role, ref: p.ref, name: p.name, number: format(p.number), masked: mask(p.number), uvId: p.uvId, type: p.type, category: p.category ?? null }));
  return (
    <div className="auth">
      <aside className="auth-brand" aria-label={t("signin.brandLabel")}>
        <p className="auth-lockup"><Logo size={40} priority /> <span className="wordmark">UNIVAULT</span></p>
        <p className="auth-headline">{t("signin.hero.title")}</p>
        <ul className="auth-proofs">
          {PROOFS.map(([k, Icon]) => <li key={k}><Icon size={20} aria-hidden="true" /> {t(k)}</li>)}
        </ul>
        <p className="auth-note" role="note">{t("signin.footer")}</p>
      </aside>
      <section className="auth-panel">
        <div className="auth-top"><LangSwitch /></div>
        <div className="auth-col">
          <h1>{t("signin.panel.title")}</h1>
          <p className="meta">{t("signin.panel.sub")}</p>
          <SignInFlow profiles={profiles} initialNumber={generate()} />
        </div>
        <footer className="auth-foot">
          <Link prefetch={false} href="/threat-model">{t("footer.threatModel")}</Link>
          <Link prefetch={false} href="/policy">{t("footer.policy")}</Link>
          <DisplayMenu initialSize={parseSize(jar.get(SIZE_COOKIE)?.value)} initialContrast={parseContrast(jar.get(CONTRAST_COOKIE)?.value)} />
          <HelpPanel />
        </footer>
      </section>
    </div>
  );
}
