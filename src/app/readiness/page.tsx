/**
 * READINESS — "am I ready to apply for X?" for each purpose (job, scholarship, overseas check).
 *
 * Each purpose is a JSON rule pack (src/rules/). Every rule line shows pass / fail / unknown with its
 * reason, the documents it used (linked), and the <Explain> actions. The overall answer is
 * ready / not ready / needs confirmation, exactly as the rules engine computed it (no logic here).
 * The packs are labelled "demo rules, not official requirements".
 */
import { TriBadge } from "@/components/Badges";
import { Explain } from "@/components/Explain";
import { getI18n } from "@/lib/i18n-server";
import { evaluatePack, loadPacks } from "@/lib/rules";
import { loadDemoVault } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OVERALL_TRI = { ready: "pass", not_ready: "fail", needs_confirmation: "unknown" } as const;

export default async function ReadinessPage() {
  const { lang, t } = await getI18n();
  const ctx = await loadDemoVault();
  const titles = Object.fromEntries(ctx.docs.map((d) => [d.id, d.title]));
  const packs = loadPacks();

  return (
    <>
      <h1>{t("readiness.title")}</h1>
      <p className="lead">{t("readiness.intro", { today: ctx.today })}</p>
      {packs.map((pack) => {
        const r = evaluatePack(pack, ctx);
        const te = lang === "te";
        const headingId = `pack-${pack.id}`;
        return (
          <section key={pack.id} className="panel" aria-labelledby={headingId}>
            <div className="card-head">
              <h2 id={headingId}>{te && pack.title_te ? pack.title_te : pack.title}</h2>
              <p className="overall"><TriBadge status={OVERALL_TRI[r.overall]} t={t} /> {t(`overall.${r.overall}`)}</p>
            </div>
            <p className="note">{te && pack.disclaimer_te ? pack.disclaimer_te : pack.disclaimer} · <span lang="en">{pack.source}</span> · {t("readiness.reviewed", { date: pack.lastReviewed })} · <a href={`/s/preview?purpose=${pack.id}`}>{t("readiness.preview")}</a></p>
            <ol className="rules">
              {r.results.map((res) => {
                const spec = pack.rules.find((x) => x.id === res.ruleId);
                return (
                  <li key={res.ruleId}>
                    <p className="rule-head"><TriBadge status={res.status} t={t} /><strong>{te && spec?.label_te ? spec.label_te : res.label}</strong></p>
                    <Explain explanation={res.explanation} kind="readiness_rule" targetId={`${pack.id}:${res.ruleId}`} docs={titles} />
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </>
  );
}
