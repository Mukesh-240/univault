/**
 * HOME / MY DOCUMENTS — the sender's first screen after sign-in.
 *
 * Plain-English picture, top to bottom:
 *   1. one line: "Namaste, <name>" (the name comes from the session) and one quiet sentence;
 *   2. "Am I ready?": a compact row of three cards (Job, Overseas credential check, Scholarship), each a small ring,
 *      one short sentence and a text link;
 *   3. a one-line note when some documents need a look, with links to them;
 *   4. "My documents" as a clean list: icon, title, issuer, status chip (icon + word), when it was last checked and a
 *      row menu. Filter chips (where from, status) and the search box sit on one line. 12 rows, then "Show more";
 *   5. for experts (collapsed): date-of-birth and duplicate checks across documents, and erased documents.
 * This page only DISPLAYS what the engines decided; it makes no decision of its own.
 */
import Link from "next/link";
import { Camera, ChevronRight, Ellipsis, FilePlus2, Upload } from "lucide-react";
import { DocIcon } from "@/components/DocIcon";
import { Explain } from "@/components/Explain";
import { ReadyRing } from "@/components/ReadyRing";
import { StatusChip } from "@/components/StatusChip";
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

const PAGE = 12; // rows shown at first; "Show more" adds this many each time

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; status?: string; n?: string }> }) {
  const { lang, t } = await getI18n();
  const sp = await searchParams;
  const tab = parseTab(sp.tab), q = (sp.q ?? "").slice(0, 80), status = parseStatusFilter(sp.status);
  const [ctx, session] = await Promise.all([loadDemoVault(), currentSession()]);
  const now = new Date();
  const docs = filterDocs(ctx.docs, ctx, { tab, q, status });
  const shown = Math.max(PAGE, Math.min(Number(sp.n) || PAGE, docs.length));

  const packs = loadPacks().map((pack) => {
    const r = evaluatePack(pack, ctx);
    const total = r.results.length;
    const open = r.results.filter((x) => x.status !== "pass").length;
    return { id: pack.id, title: lang === "te" && pack.title_te ? pack.title_te : pack.title, open, total, done: total - open };
  });

  // Documents that need a look: not accepted, or needing attention.
  const needLook = ctx.docs.filter((d) => ["attention", "rejected"].includes(statusOfDoc(d, ctx)));

  // For experts: checks across documents, and the erased documents (only a fingerprint remains of those).
  const titles = Object.fromEntries(ctx.docs.map((d) => [d.id, d.title]));
  const dups = findDuplicates(ctx.docs);
  const dob = dobConsistency(ctx.docs);
  const all = await supabase.from("documents").select("id, doc_type, sha256, created_at").eq("owner", DEMO_OWNER).order("created_at");
  const erased = ((all.data ?? []) as { id: string; doc_type: string; sha256: string; created_at: string }[]).filter((d) => !ctx.docs.some((x) => x.id === d.id));

  const when = (iso: string | undefined) => { const a = agoKey(agoParts(iso, now)); return t(a.key, { n: a.n ?? 0 }); };
  const href = (o: { tab?: string; status?: string; n?: number }) => {
    const u = new URLSearchParams();
    u.set("tab", o.tab ?? tab);
    if (q) u.set("q", q);
    const st = o.status ?? status;
    if (st !== "all") u.set("status", st);
    if (o.n) u.set("n", String(o.n));
    return `/?${u.toString()}`;
  };

  return (
    <div className="home-grid">
      <div className="home-main">
        <h1 className="greeting">{session?.name ? t("home.greeting", { name: session.name }) : t("home.greetingNoName")}</h1>
        <p className="meta">{t("home.subtitle")}</p>

        <section aria-labelledby="ready-h" className="section">
          <h2 id="ready-h" className="h3">{t("home.readyTitle")}</h2>
          <div className="ready-row">
            {packs.map((p) => (
              <article key={p.id} className="card ready-card" aria-labelledby={`rc-${p.id}`}>
                <h3 id={`rc-${p.id}`} className="sr-only">{p.title}</h3>
                <ReadyRing done={p.done} total={p.total} label={t("home.ring.sr", { pack: p.title, done: p.done, total: p.total })} tone={p.open === 0 ? "ok" : "warn"} />
                <div className="ready-text">
                  <p className="big">{p.open === 0 ? t("home.ready.ok", { pack: p.title }) : p.open === 1 ? t("home.ready.one", { pack: p.title }) : t("home.ready.n", { pack: p.title, n: p.open })}</p>
                  <Link href={`/readiness#pack-${p.id}`} className="text-link">{p.open === 0 ? t("home.ready.btnOk") : t("home.ready.btn")} <ChevronRight size={16} aria-hidden="true" /></Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {needLook.length > 0 && (
          <section aria-labelledby="attn-h" className="attention-line">
            <h2 id="attn-h" className="sr-only">{t("home.attention.title")}</h2>
            <p><strong>{t("home.attention.title")}:</strong>{" "}
              {needLook.slice(0, 3).map((d, i) => (
                <span key={d.id}>{i > 0 ? ", " : ""}<Link href={`/doc/${d.id}`} aria-label={`${t("home.attention.look")}: ${d.title}`} lang={hasTelugu(d.title) ? "te" : undefined}>{d.title}</Link></span>
              ))}
              {needLook.length > 3 ? ` +${needLook.length - 3}` : ""}
            </p>
          </section>
        )}

        <section aria-labelledby="docs-h" className="section">
          <div className="section-head">
            <h2 id="docs-h" className="h3">{t("home.docsTitle")}</h2>
            <Link href="/add" className="btn btn-small"><FilePlus2 size={18} aria-hidden="true" /> {t("home.addTitle")}</Link>
          </div>
          <div className="filter-bar">
            <nav aria-label={t("home.tabsLabel")} className="chips-nav">
              <Link href={href({ tab: "issuer" })} aria-current={tab === "issuer" ? "page" : undefined}>{t("home.tab.issuer")}</Link>
              <Link href={href({ tab: "mine" })} aria-current={tab === "mine" ? "page" : undefined}>{t("home.tab.mine")}</Link>
            </nav>
            <nav aria-label={t("home.statusLegend")} className="chips-nav">
              {(["all", ...STATUSES] as const).map((st) => (
                <Link key={st} href={href({ status: st })} aria-current={status === st ? "page" : undefined}>{st === "all" ? t("home.status.all") : t(`status.${st}`)}</Link>
              ))}
            </nav>
            <form className="search-inline" role="search" method="get" action="/">
              <input type="hidden" name="tab" value={tab} />
              {status !== "all" && <input type="hidden" name="status" value={status} />}
              <label htmlFor="q" className="sr-only">{t("home.search")}</label>
              <input id="q" name="q" type="search" defaultValue={q} autoComplete="off" placeholder={t("home.searchBtn")} />
              <button type="submit" className="secondary">{t("home.searchBtn")}</button>
            </form>
          </div>

          {docs.length === 0 ? (
            <div className="empty-state">
              <FilePlus2 size={32} aria-hidden="true" />
              <p>{tab === "mine" && !q && status === "all" ? t("home.noneMine") : t("home.none")}</p>
              <Link href="/add" className="btn">{t("home.addTitle")}</Link>
            </div>
          ) : (
            <>
              <ul className="doc-list">
                <li className="doc-row doc-head" aria-hidden="true">
                  <span>{t("home.col.document")}</span><span>{t("home.col.issuer")}</span><span>{t("home.col.status")}</span><span>{t("home.col.added")}</span><span>{t("home.col.actions")}</span>
                </li>
                {docs.slice(0, shown).map((d) => (
                  <li key={d.id} id={`doc-${d.id}`} className="doc-row">
                    <span className="doc-title"><DocIcon type={d.doc_type} />
                      <Link href={`/doc/${d.id}`} aria-label={`${t("home.open")}: ${d.title}`} lang={hasTelugu(d.title) ? "te" : undefined}>{d.title}</Link>
                    </span>
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
              {docs.length > shown && <p><Link href={href({ n: shown + PAGE })} className="btn secondary btn-small">{t("home.showMore", { n: Math.min(PAGE, docs.length - shown) })}</Link></p>}
            </>
          )}
          <p className="meta add-ways">
            <Link href="/ocr"><Camera size={16} aria-hidden="true" /> {t("home.add.photo")}</Link>
            <Link href="/add/file"><Upload size={16} aria-hidden="true" /> {t("home.add.file")}</Link>
          </p>
        </section>

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
      </div>

    </div>
  );
}
