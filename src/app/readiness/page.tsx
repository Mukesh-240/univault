/**
 * AM I READY? — for each purpose (job, scholarship, overseas check) a step-by-step checklist.
 *
 * Plain-English picture:
 *   Each purpose is a card with the answer in words and colour ("You are ready" / "Not ready yet" /
 *   "Almost ready: needs your confirmation"), "3 of 5 done", and then one line per rule: a mark
 *   (done / needs you / cannot tell), the rule in plain words, the reason, and ONE button that fixes it
 *   ("Check this document", "Confirm it is you", "Fix a wrong number", "Add a document").
 *   The technical detail (confidence, source, freshness, override/escalate) is under "For experts".
 * The rules are JSON packs (src/rules/); the answers come straight from the rules engine, exactly as it
 * computed them. This page makes no decision. The packs are labelled "demo rules, not official requirements".
 */
import { Check, CircleHelp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Chip } from "@/components/StatusChip";
import { Explain } from "@/components/Explain";
import { Reason } from "@/components/Reason";
import { getI18n } from "@/lib/i18n-server";
import { evaluatePack, loadPacks } from "@/lib/rules";
import { loadDemoVault } from "@/lib/server";
import { fixFor } from "@/lib/ui-logic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OVERALL_KIND = { ready: "ok", not_ready: "warn", needs_confirmation: "warn" } as const;
const MARK = { pass: { cls: "ok", Icon: Check }, fail: { cls: "warn", Icon: TriangleAlert }, unknown: { cls: "unk", Icon: CircleHelp } } as const;

export default async function ReadinessPage() {
  const { lang, t } = await getI18n();
  const ctx = await loadDemoVault();
  const titles = Object.fromEntries(ctx.docs.map((d) => [d.id, d.title]));
  const te = lang === "te";

  return (
    <>
      <h1>{t("ready.title")}</h1>
      <p className="lead">{t("ready.intro", { today: ctx.today })}</p>
      {loadPacks().map((pack) => {
        const r = evaluatePack(pack, ctx);
        const done = r.results.filter((x) => x.status === "pass").length;
        const headingId = `pack-${pack.id}`;
        return (
          <section key={pack.id} id={headingId} className="card" aria-labelledby={`${headingId}-h`}>
            <div className="card-head">
              <h2 id={`${headingId}-h`}>{te && pack.title_te ? pack.title_te : pack.title}</h2>
              <Chip kind={OVERALL_KIND[r.overall]}>{t(`overall.${r.overall}`)}</Chip>
            </div>
            <p className="meta">{t("ready.stepOf", { done, total: r.results.length })}</p>
            <ol className="checklist">
              {r.results.map((res) => {
                const spec = pack.rules.find((x) => x.id === res.ruleId);
                const { cls, Icon } = MARK[res.status];
                const fix = fixFor(res.predicate, res.status, res.documentIds);
                return (
                  <li key={res.ruleId}>
                    <span className={`mark ${cls}`}><Icon size={22} aria-hidden="true" /></span>
                    <div className="body">
                      <p><strong>{te && spec?.label_te ? spec.label_te : res.label}</strong> <Chip kind={cls}>{t(`tri.${res.status}`)}</Chip></p>
                      <p className="meta"><Reason text={res.reason} lang={lang} /></p>
                      {fix && <div className="card-actions"><Link href={fix.href} className="btn secondary">{t(fix.key)}</Link></div>}
                      <details className="expert">
                        <summary>{t("ui.experts")}</summary>
                        <Explain explanation={res.explanation} kind="readiness_rule" targetId={`${pack.id}:${res.ruleId}`} docs={titles} />
                      </details>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="note">{te && pack.disclaimer_te ? pack.disclaimer_te : pack.disclaimer} · <span lang="en">{pack.source}</span> · {t("readiness.reviewed", { date: pack.lastReviewed })} · <a href={`/s/preview?purpose=${pack.id}`}>{t("readiness.preview")}</a></p>
          </section>
        );
      })}
    </>
  );
}
