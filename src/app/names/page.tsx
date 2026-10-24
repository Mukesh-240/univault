/**
 * NAME DETECTIVE — which documents name the same person?
 *
 * The matching engine compares every pair of documents (initials, word order, honorifics,
 * Telugu <-> Latin spelling) and ranks them best match first, each with a score, a verdict and
 * plain-language reasons. NOTHING is merged automatically: only the person's Confirm / Reject click
 * records a decision. Only the 20 closest pairs are drawn at first ("Show the next 20" adds more): a vault with
 * many documents has hundreds of pairs, and drawing them all made the page slow to use.
 */
import Link from "next/link";
import { Explain } from "@/components/Explain";
import { NameDecision } from "@/components/NameDecision";
import { Stepper } from "@/components/Steps";
import { hasTelugu } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { candidatePairs, type CandidatePair } from "@/lib/resolution";
import { loadDemoVault } from "@/lib/server";
import type { VaultDoc } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE = 20;

export default async function NamesPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { t } = await getI18n();
  const ctx = await loadDemoVault();
  const byId = new Map(ctx.docs.map((d) => [d.id, d]));
  const titles = Object.fromEntries(ctx.docs.map((d) => [d.id, d.title]));
  const pairs = candidatePairs(ctx.docs, ctx.links);
  // Closest first: likely pairs (and any the person already answered), then the unlikely ones, each in engine order.
  const ranked = [...pairs.filter((p) => p.verdict !== "unlikely" || p.decision), ...pairs.filter((p) => p.verdict === "unlikely" && !p.decision)];
  const shown = Math.min(ranked.length, Math.max(PAGE, Number((await searchParams).n) || PAGE));

  const item = (p: CandidatePair, rank: number) => {
    const a = byId.get(p.a)!, b = byId.get(p.b)!;
    const label = `${a.title} / ${b.title}`;
    return (
      <li key={`${p.a}|${p.b}`} className="card pair">
        <h2 className="h3">{t("names.question")}</h2>
        <div className="name-cards">
          <div className="name-card"><p className="meta">{t("names.on", { title: a.title })}</p><p className="the-name"><Name doc={a} field={p.fieldA} /></p></div>
          <div className="name-card"><p className="meta">{t("names.on", { title: b.title })}</p><p className="the-name"><Name doc={b} field={p.fieldB} /></p></div>
        </div>
        <p className="meta">{t("names.rank", { n: rank })}: {t(`verdict.${p.verdict}`)}</p>
        <NameDecision a={p.a} b={p.b} decision={p.decision} label={label} />
        <details className="expert">
          <summary>{t("ui.experts")}</summary>
          <p className="score">{t("conf.score", { value: p.score.toFixed(2) })}</p>
          <Explain explanation={p.explanation} kind="name_match" targetId={`${p.a}|${p.b}`} docs={titles} />
        </details>
      </li>
    );
  };

  return (
    <>
      <h1>{t("names.title")}</h1>
      <p className="lead">{t("names.intro")}</p>
      <p className="note">{t("names.never")}</p>
      <Stepper steps={["stepper.names.1", "stepper.names.2"]} current={1} here="stepper.names.1.here" next="stepper.names.1.next" />
      {ranked.length === 0 ? <p>{t("names.none")}</p> : (
        <>
          <p className="meta">{t("names.showing", { shown, total: ranked.length })}</p>
          <ol className="cards">{ranked.slice(0, shown).map((p, i) => item(p, i + 1))}</ol>
          {shown < ranked.length && <p><Link href={`/names?n=${shown + PAGE}`} className="btn secondary">{t("names.showMore", { n: Math.min(PAGE, ranked.length - shown) })}</Link></p>}
        </>
      )}
    </>
  );
}

/** One name as printed on its document (Telugu names are marked lang="te" so they render and read correctly). */
function Name({ doc, field }: { doc: VaultDoc; field: string }) {
  const v = doc.fields[field] ?? "";
  return <strong lang={hasTelugu(v) ? "te" : undefined}>{v}</strong>;
}
