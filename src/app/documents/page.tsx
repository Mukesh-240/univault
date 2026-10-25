/**
 * MY DOCUMENTS — every document in the vault, with one search box and one filter (status, where it came from).
 * Related tools live here as quiet links: Scan and fix (photos), Are these the same person?, Check all with issuers.
 * For experts (collapsed): date-of-birth and duplicate checks across documents, and the erased documents.
 * This page only DISPLAYS what the engines decided.
 */
import Link from "next/link";
import { Ellipsis, FilePlus2 } from "lucide-react";
import { DocIcon } from "@/components/DocIcon";
import { Explain } from "@/components/Explain";
import { PageHead } from "@/components/PageHead";
import { StatusChip } from "@/components/StatusChip";
import { dobConsistency, dobExplanation, findDuplicates } from "@/lib/duplicates";
import { hasTelugu, showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { DEMO_OWNER, loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { agoKey, agoParts, isFromIssuer, STATUSES, statusOfDoc } from "@/lib/ui-logic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE = 20;
const SOURCES = ["all", "issuer", "mine"] as const;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; source?: string; n?: string }> }) {
  const { t } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80).trim().toLowerCase();
  const status = ["all", "open", ...STATUSES].includes(sp.status ?? "") ? sp.status! : "all";
  const source = (SOURCES as readonly string[]).includes(sp.source ?? "") ? sp.source! : "all";
  const ctx = await loadDemoVault();
  const now = new Date();
  const docs = ctx.docs.filter((d) => {
    const st = statusOfDoc(d, ctx);
    if (status === "open" ? st === "verified" : status !== "all" && st !== status) return false;
    if (source !== "all" && (source === "issuer") !== isFromIssuer(d)) return false;
    return !q || `${d.title} ${d.issuer ?? ""} ${d.doc_type.replace(/_/g, " ")}`.toLowerCase().includes(q);
  }).reverse();
  const shown = Math.min(docs.length, Math.max(PAGE, Number(sp.n) || PAGE));
  const when = (iso: string | undefined) => { const a = agoKey(agoParts(iso, now)); return t(a.key, { n: a.n ?? 0 }); };
  const more = new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), status, source, n: String(shown + PAGE) }).toString();

  const titles = Object.fromEntries(ctx.docs.map((d) => [d.id, d.title]));
  const dups = findDuplicates(ctx.docs);
  const dob = dobConsistency(ctx.docs);
  const all = await supabase.from("documents").select("id, doc_type, sha256, created_at").eq("owner", DEMO_OWNER).order("created_at");
  const erased = ((all.data ?? []) as { id: string; doc_type: string; sha256: string; created_at: string }[]).filter((d) => !ctx.docs.some((x) => x.id === d.id));

  return (
    <>
      <PageHead title={t("home.docsTitle")} purpose={t("docs2.purpose")} action={{ href: "/add", label: t("home.addTitle"), icon: <FilePlus2 size={18} aria-hidden="true" /> }}
        links={[{ href: "/ocr", label: t("nav.ocr") }, { href: "/names", label: t("nav.names") }, { href: "/verify", label: t("home2.checkAll") }]} />

      <form className="filter-bar" method="get" action="/documents" role="search">
        <label htmlFor="dq" className="sr-only">{t("home.search")}</label>
        <input id="dq" name="q" type="search" defaultValue={sp.q ?? ""} placeholder={t("home.search")} autoComplete="off" />
        <label htmlFor="dstatus" className="sr-only">{t("home.statusLegend")}</label>
        <select id="dstatus" name="status" defaultValue={status}>
          <option value="all">{t("docs2.status.all")}</option>
          <option value="open">{t("docs2.status.open")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        <label htmlFor="dsource" className="sr-only">{t("home.tabsLabel")}</label>
        <select id="dsource" name="source" defaultValue={source}>
          {SOURCES.map((s) => <option key={s} value={s}>{t(`docs2.source.${s}`)}</option>)}
        </select>
        <button type="submit" className="secondary">{t("docs2.apply")}</button>
      </form>

      {docs.length === 0 ? (
        <div className="empty-state"><FilePlus2 size={28} aria-hidden="true" /><p>{ctx.docs.length === 0 ? t("home2.empty") : t("home.none")}</p><Link href="/add" className="btn">{t("home.addTitle")}</Link></div>
      ) : (
        <>
          <p className="meta">{t("docs2.count", { shown, n: docs.length })}</p>
          <ul className="doc-list">
            <li className="doc-row doc-head" aria-hidden="true">
              <span>{t("home.col.document")}</span><span>{t("home.col.issuer")}</span><span>{t("home.col.status")}</span><span>{t("home.col.added")}</span><span>{t("home.col.actions")}</span>
            </li>
            {docs.slice(0, shown).map((d) => (
              <li key={d.id} id={`doc-${d.id}`} className="doc-row">
                <span className="doc-title"><DocIcon type={d.doc_type} />
                  <Link href={`/doc/${d.id}`} aria-label={`${t("home.open")}: ${d.title}`} lang={hasTelugu(d.title) ? "te" : undefined}>{d.title}</Link></span>
                <span className="meta">{d.issuer ?? t("vault.noIssuer")}</span>
                <span><StatusChip status={statusOfDoc(d, ctx)} t={t} /></span>
                <span className="meta tabular">{when(ctx.verification[d.id]?.checkedAt)}</span>
                <details className="row-menu">
                  <summary aria-label={t("home.rowMenu", { title: d.title })}><Ellipsis size={18} aria-hidden="true" /></summary>
                  <ul>
                    <li><Link href={`/doc/${d.id}`}>{t("home.open")}</Link></li>
                    <li><Link href={`/share?from=${d.doc_type}`}>{t("doc.share")}</Link></li>
                    <li><Link href="/verify">{t("nav.verify")}</Link></li>
                  </ul>
                </details>
              </li>
            ))}
          </ul>
          {docs.length > shown && <p><Link href={`/documents?${more}`} className="btn secondary btn-small">{t("home.showMore", { n: Math.min(PAGE, docs.length - shown) })}</Link></p>}
        </>
      )}

      <details className="expert">
        <summary>{t("ui.experts")}: {t("vault.checks")}</summary>
        <h3>{t("vault.dob")}</h3>
        <Explain explanation={dobExplanation(dob)} kind="duplicate" targetId="dob-consistency" docs={titles} />
        <h3>{t("vault.duplicates")}</h3>
        {dups.length === 0 ? <p>{t("vault.noDuplicates")}</p> : (
          <ul className="rules">
            {dups.map((p) => (
              <li key={`${p.a}|${p.b}`}>
                <p className="rule-head"><strong>{t(`dup.${p.kind}`)}</strong></p>
                <Explain explanation={{ ...p.explanation, documentIds: [p.a, p.b] }} kind="duplicate" targetId={`${p.a}|${p.b}`} docs={titles} />
              </li>
            ))}
          </ul>
        )}
        {erased.length > 0 && (
          <>
            <h3>{t("erase.listTitle")}</h3>
            <p className="note">{t("erase.listNote")}</p>
            <ul>{erased.map((d) => <li key={d.id}>{d.doc_type.replace(/_/g, " ")} · <code>{d.sha256.slice(0, 16)}…</code> · {showTime(d.created_at)}</li>)}</ul>
          </>
        )}
      </details>
    </>
  );
}
