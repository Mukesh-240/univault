/**
 * HOME / MY DOCUMENTS — the first screen after sign-in.
 *
 * Plain-English picture, top to bottom:
 *   1. "Namaste, <name>": the name comes from the vault's identity card (read at sign-in, kept in the session);
 *   2. one "Am I ready?" card per purpose (Job, Overseas credential check, Scholarship) with ONE sentence
 *      ("Job application: 2 things need your attention") and one button;
 *   3. the documents, on two tabs ("From issuers" / "Uploaded by me"), with a search box and a status
 *      filter. Each card: icon, title, issuer, status chip (icon + word + colour), "Last checked <time>",
 *      and one button, "Open". The search and filter are a plain form, so they work without JavaScript;
 *   4. "Add a document" with two big choices;
 *   5. for experts (collapsed): date-of-birth and duplicate checks across documents, and erased documents.
 * This page only DISPLAYS what the engines decided; it makes no decision of its own.
 */
import Link from "next/link";
import { DocIcon } from "@/components/DocIcon";
import { Explain } from "@/components/Explain";
import { StatusChip } from "@/components/StatusChip";
import { Camera, Upload } from "lucide-react";
import { currentSession } from "@/lib/auth-server";
import { dobConsistency, dobExplanation, findDuplicates } from "@/lib/duplicates";
import { hasTelugu, showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { evaluatePack, loadPacks } from "@/lib/rules";
import { DEMO_OWNER, loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { agoKey, agoParts, filterDocs, parseStatusFilter, parseTab, STATUSES, statusOfDoc } from "@/lib/ui-logic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; status?: string }> }) {
  const { lang, t } = await getI18n();
  const sp = await searchParams;
  const tab = parseTab(sp.tab), q = (sp.q ?? "").slice(0, 80), status = parseStatusFilter(sp.status);
  const [ctx, session] = await Promise.all([loadDemoVault(), currentSession()]);
  const now = new Date();
  const docs = filterDocs(ctx.docs, ctx, { tab, q, status });

  const packs = loadPacks().map((pack) => {
    const r = evaluatePack(pack, ctx);
    const open = r.results.filter((x) => x.status !== "pass").length;
    return { id: pack.id, title: lang === "te" && pack.title_te ? pack.title_te : pack.title, open };
  });

  // For experts: checks across documents, and the erased documents (only a fingerprint remains of those).
  const titles = Object.fromEntries(ctx.docs.map((d) => [d.id, d.title]));
  const dups = findDuplicates(ctx.docs);
  const dob = dobConsistency(ctx.docs);
  const all = await supabase.from("documents").select("id, doc_type, sha256, created_at").eq("owner", DEMO_OWNER).order("created_at");
  const erased = ((all.data ?? []) as { id: string; doc_type: string; sha256: string; created_at: string }[]).filter((d) => !ctx.docs.some((x) => x.id === d.id));

  const when = (iso: string | undefined) => { const a = agoKey(agoParts(iso, now)); return t(a.key, { n: a.n ?? 0 }); };
  const tabHref = (tb: string) => `/?tab=${tb}${q ? `&q=${encodeURIComponent(q)}` : ""}${status !== "all" ? `&status=${status}` : ""}`;

  return (
    <>
      <div className="page-head">
        <h1 className="greeting">{session?.name ? t("home.greeting", { name: session.name }) : t("home.greetingNoName")}</h1>
        <p className="lead">{t("home.subtitle")}</p>
      </div>

      <section aria-labelledby="ready-h" className="stack-s">
        <h2 id="ready-h">{t("home.readyTitle")}</h2>
        <div className="grid">
          {packs.map((p) => (
            <article key={p.id} className="card ready-card" aria-labelledby={`rc-${p.id}`}>
              <h3 id={`rc-${p.id}`} className="sr-only">{p.title}</h3>
              <p className="big">{p.open === 0 ? t("home.ready.ok", { pack: p.title }) : p.open === 1 ? t("home.ready.one", { pack: p.title }) : t("home.ready.n", { pack: p.title, n: p.open })}</p>
              <div className="card-actions"><Link href={`/readiness#pack-${p.id}`} className="btn secondary">{p.open === 0 ? t("home.ready.btnOk") : t("home.ready.btn")}</Link></div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="docs-h" className="stack-s" style={{ marginTop: "var(--s4)" }}>
        <h2 id="docs-h">{t("home.docsTitle")}</h2>
        <nav aria-label={t("home.tabsLabel")} className="tabs-nav">
          <Link href={tabHref("issuer")} aria-current={tab === "issuer" ? "page" : undefined}>{t("home.tab.issuer")}</Link>
          <Link href={tabHref("mine")} aria-current={tab === "mine" ? "page" : undefined}>{t("home.tab.mine")}</Link>
        </nav>
        <form className="filter-form" method="get" action="/">
          <input type="hidden" name="tab" value={tab} />
          <div className="field">
            <label htmlFor="q">{t("home.search")}</label>
            <div className="search">
              <input id="q" name="q" type="search" defaultValue={q} autoComplete="off" />
              <button type="submit">{t("home.searchBtn")}</button>
            </div>
          </div>
          <fieldset className="radio-cards">
            <legend>{t("home.statusLegend")}</legend>
            {(["all", ...STATUSES] as const).map((s) => (
              <label key={s} className="radio-card">
                <input type="radio" name="status" value={s} defaultChecked={status === s} />
                {s === "all" ? t("home.status.all") : t(`status.${s}`)}
              </label>
            ))}
          </fieldset>
        </form>

        {docs.length === 0 ? <p className="card">{tab === "mine" && !q && status === "all" ? t("home.noneMine") : t("home.none")}</p> : (
          <ul className="cards">
            {docs.map((d) => {
              const v = ctx.verification[d.id];
              return (
                <li key={d.id} id={`doc-${d.id}`} className="card">
                  <div className="card-head">
                    <div className="icon-title"><DocIcon type={d.doc_type} /><h3 lang={hasTelugu(d.title) ? "te" : undefined}>{d.title}</h3></div>
                    <StatusChip status={statusOfDoc(d, ctx)} t={t} />
                  </div>
                  <p className="meta">{d.issuer ? t("home.issuedBy", { issuer: d.issuer }) : t("vault.noIssuer")}</p>
                  <p className="meta">{t("home.lastChecked", { when: when(v?.checkedAt) })}</p>
                  <div className="card-actions"><Link href={`/doc/${d.id}`} className="btn" aria-label={`${t("home.open")}: ${d.title}`}>{t("home.open")}</Link></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-h" className="stack-s" style={{ marginTop: "var(--s4)" }}>
        <h2 id="add-h">{t("home.addTitle")}</h2>
        <div className="grid">
          <Link href="/ocr" className="choice"><Camera size={32} aria-hidden="true" /><div><strong>{t("home.add.photo")}</strong><span>{t("home.add.photoNote")}</span></div></Link>
          <Link href="/add/file" className="choice"><Upload size={32} aria-hidden="true" /><div><strong>{t("home.add.file")}</strong><span>{t("home.add.fileNote")}</span></div></Link>
        </div>
      </section>

      <details className="expert" style={{ marginTop: "var(--s4)" }}>
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
