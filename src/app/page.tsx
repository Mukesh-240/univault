/**
 * HOME / MY DOCUMENTS — the sender's first screen after sign-in.
 *
 * Plain-English picture, top to bottom:
 *   1. a soft blue hero: "Namaste, <name>" (the name comes from the session) and one calm sentence;
 *   2. "Am I ready?": one card per purpose (Job, Overseas credential check, Scholarship) with a progress RING that
 *      fills and counts up (CSS only), one sentence and one button;
 *   3. "Needs your attention": the documents that were not accepted or need a look, each with its status and a button;
 *   4. the documents, on two tabs ("From issuers" / "Uploaded by me"), with a search box and a status filter,
 *      as a grid of cards (icon, title, issuer, status chip with icon + word + colour, "Last checked …", "Open"),
 *      ending with an "Add a document" card; on wide screens a right column shows recent activity;
 *   5. for experts (collapsed): date-of-birth and duplicate checks across documents, and erased documents.
 * This page only DISPLAYS what the engines decided; it makes no decision of its own.
 */
import Link from "next/link";
import { Camera, FilePlus2, Upload } from "lucide-react";
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
import { listNotifications, loadShares } from "@/lib/share-store";
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
    const total = r.results.length;
    const open = r.results.filter((x) => x.status !== "pass").length;
    return { id: pack.id, title: lang === "te" && pack.title_te ? pack.title_te : pack.title, open, total, done: total - open };
  });

  // Documents that need a look: not accepted, or needing attention.
  const needLook = ctx.docs.filter((d) => ["attention", "rejected"].includes(statusOfDoc(d, ctx)));

  // Recent activity (the same alerts as the Alerts page), newest first.
  const [alerts, shares] = await Promise.all([listNotifications(supabase, DEMO_OWNER, 4), loadShares(supabase, DEMO_OWNER)]);
  const byId = new Map(shares.map((s) => [s.id, s]));
  const activity = alerts.map((a) => {
    const share = a.shareId ? byId.get(a.shareId) : undefined;
    const time = showTime(a.at);
    return a.kind === "issuer_change"
      ? t("alert.issuer_change", { title: String(a.detail.title ?? ""), time, n: Array.isArray(a.detail.share_ids) ? a.detail.share_ids.length : 0 })
      : t(`alert.${a.kind}`, { name: share?.recipientName ?? a.recipientCode ?? "", purpose: a.purpose ?? "", time });
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
    <div className="home-grid">
      <div className="home-main">
        <section className="hero">
          <h1 className="greeting">{session?.name ? t("home.greeting", { name: session.name }) : t("home.greetingNoName")}</h1>
          <p className="lead">{t("home.subtitle")}</p>
        </section>

        <section aria-labelledby="ready-h" className="stack-s">
          <h2 id="ready-h">{t("home.readyTitle")}</h2>
          <div className="grid">
            {packs.map((p) => (
              <article key={p.id} className="card ready-card" aria-labelledby={`rc-${p.id}`}>
                <h3 id={`rc-${p.id}`} className="sr-only">{p.title}</h3>
                <ReadyRing done={p.done} total={p.total} label={t("home.ring.sr", { pack: p.title, done: p.done, total: p.total })} tone={p.open === 0 ? "ok" : "warn"} />
                <p className="big">{p.open === 0 ? t("home.ready.ok", { pack: p.title }) : p.open === 1 ? t("home.ready.one", { pack: p.title }) : t("home.ready.n", { pack: p.title, n: p.open })}</p>
                <div className="card-actions"><Link href={`/readiness#pack-${p.id}`} className="btn secondary">{p.open === 0 ? t("home.ready.btnOk") : t("home.ready.btn")}</Link></div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="attn-h" className="attention-strip" style={{ marginTop: "var(--s4)" }}>
          <h2 id="attn-h" className="h3">{t("home.attention.title")}</h2>
          {needLook.length === 0 ? <p className="meta">{t("home.attention.none")}</p> : (
            <ul className="attention-list">
              {needLook.map((d) => (
                <li key={d.id}>
                  <span className="icon-title"><DocIcon type={d.doc_type} /><strong lang={hasTelugu(d.title) ? "te" : undefined}>{d.title}</strong></span>
                  <StatusChip status={statusOfDoc(d, ctx)} t={t} />
                  <Link href={`/doc/${d.id}`} className="btn secondary btn-small" aria-label={`${t("home.attention.look")}: ${d.title}`}>{t("home.attention.look")}</Link>
                </li>
              ))}
            </ul>
          )}
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

          {docs.length === 0 ? (
            <div className="empty-state">
              <FilePlus2 size={44} aria-hidden="true" />
              <h3>{t("home.empty.title")}</h3>
              <p>{tab === "mine" && !q && status === "all" ? t("home.noneMine") : t("home.none")}</p>
              <Link href="/add" className="btn">{t("home.addTitle")}</Link>
            </div>
          ) : (
            <ul className="cards doc-grid">
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
              <li className="card add-card">
                <FilePlus2 size={36} aria-hidden="true" />
                <h3>{t("home.addTitle")}</h3>
                <div className="card-actions">
                  <Link href="/ocr" className="btn secondary"><Camera size={20} aria-hidden="true" /> {t("home.add.photo")}</Link>
                  <Link href="/add/file" className="btn secondary"><Upload size={20} aria-hidden="true" /> {t("home.add.file")}</Link>
                </div>
              </li>
            </ul>
          )}
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
      </div>

      <aside className="home-aside" aria-labelledby="act-h">
        <section className="card">
          <h2 id="act-h" className="h3">{t("home.activity.title")}</h2>
          {activity.length === 0 ? <p className="meta">{t("home.activity.none")}</p> : (
            <ul className="activity-list">{activity.map((a, i) => <li key={i}>{a}</li>)}</ul>
          )}
          <Link href="/alerts" className="btn secondary btn-small">{t("home.activity.all")}</Link>
        </section>
      </aside>
    </div>
  );
}
