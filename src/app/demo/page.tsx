/**
 * DEMO GUIDE — the demo script for judges, from src/config/demo-guide.json: six numbered steps, each one plain sentence,
 * the role to use (with the demo cast's name for it), and a "Go" button to the exact screen. When you are signed in as
 * a different role, the step says so and its button goes to the sign-in page instead. No results are written here.
 */
import Link from "next/link";
import cast from "@/config/demo-cast.json";
import guide from "@/config/demo-guide.json";
import { PageHead } from "@/components/PageHead";
import { currentSession } from "@/lib/auth-server";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const WHO: Record<string, string> = { issuer: cast.issuers[0].name, sender: cast.sender.name, receiver: cast.receivers[0].name };

export default async function DemoPage() {
  const { t } = await getI18n();
  const role = (await currentSession())?.role ?? "sender";
  return (
    <>
      <PageHead title={t("demo.title")} purpose={t("demo.purpose")} action={{ href: "/features", label: t("features.link") }} />
      <ol className="demo-steps">
        {guide.steps.map((s, i) => {
          const here = s.role === role;
          return (
            <li key={s.id} className="card demo-step">
              <span className="demo-n" aria-hidden="true">{i + 1}</span>
              <div className="demo-txt">
                <h2 className="h3">{t(`demo.step.${s.id}`)}</h2>
                <p className="meta">{t(`demo.step.${s.id}.why`)}</p>
                <p className="meta">{t("demo.as", { role: t(`signin.role.${s.role}.tag`), who: WHO[s.role] })}{here ? "" : ` · ${t("demo.switch")}`}</p>
              </div>
              <Link href={here ? s.href : "/signin"} className={here ? "btn btn-small" : "btn secondary btn-small"} data-step={s.id} data-href={s.href}
                aria-label={`${t("demo.go")}: ${t(`demo.step.${s.id}`)}`}>{here ? t("demo.go") : t("demo.signInAs", { role: t(`signin.role.${s.role}.tag`) })}</Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
