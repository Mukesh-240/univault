/**
 * HOME — the student's first screen. One job: show what needs doing, and where everything is.
 *
 * Plain-English picture, top to bottom (max 1100 px wide):
 *   1. "Namaste, <first name>" and one status sentence from real data ("9 documents. 4 need your attention.");
 *   2. "What do you want to do?": four tiles (Add a document, Check if I'm ready, Share with someone, See who has my
 *      documents), each a whole clickable link with one plain line;
 *   3. "Needs your attention": at most 3 rows, one per document TITLE (copies are grouped, never repeated), each with
 *      the reason in plain words and one button; "All clear" when nothing needs a look;
 *   4. "Ready for…": ONE card with a purpose picker and one ring (from the readiness rules);
 *   5. "My documents": the 6 most recent, compact, with "See all documents" (the full list with filters).
 * This page only DISPLAYS what the engines decided; it makes no decision of its own.
 */
import Link from "next/link";
import { CircleCheck, FilePlus2, ListChecks, Send, ShieldCheck } from "lucide-react";
import { DocIcon } from "@/components/DocIcon";
import { StatusChip } from "@/components/StatusChip";
import { currentSession } from "@/lib/auth-server";
import { hasTelugu } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { evaluatePack, loadPacks } from "@/lib/rules";
import { loadDemoVault } from "@/lib/server";
import { attentionRows, statusOfDoc } from "@/lib/ui-logic";
import { ReadyCard } from "./ReadyCard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT = 6;
const TILES = [
  { href: "/add", key: "add", Icon: FilePlus2 },
  { href: "/readiness", key: "ready", Icon: ListChecks },
  { href: "/share", key: "share", Icon: Send },
  { href: "/shares", key: "access", Icon: ShieldCheck },
] as const;
const ACTION: Record<string, string> = { rejected: "home2.action.look", attention: "home2.action.confirm", unchecked: "home2.action.check" };

export default async function HomePage() {
  const { lang, t } = await getI18n();
  const [ctx, session] = await Promise.all([loadDemoVault(), currentSession()]);
  const first = (session?.name ?? "").split(/\s+/)[0] ?? "";
  const { rows, total } = attentionRows(ctx.docs, ctx);
  const packs = loadPacks().map((pack) => {
    const r = evaluatePack(pack, ctx);
    const open = r.results.filter((x) => x.status !== "pass").length;
    const title = lang === "te" && pack.title_te ? pack.title_te : pack.title;
    const done = r.results.length - open;
    // The words are made here (the server has every word list); the card in the browser only switches between packs.
    return { id: pack.id, title, total: r.results.length, done, open,
      sentence: open === 0 ? t("home.ready.ok", { pack: title }) : open === 1 ? t("home.ready.one", { pack: title }) : t("home.ready.n", { pack: title, n: open }),
      cta: open === 0 ? t("home.ready.btnOk") : t("home.ready.btn"), sr: t("home.ring.sr", { pack: title, done, total: r.results.length }) };
  });
  const recent = [...ctx.docs].reverse().slice(0, RECENT);
  const status = ctx.docs.length === 0 ? t("home2.status.none") : total === 0 ? t("home2.status.allGood", { n: ctx.docs.length }) : t("home2.status.some", { n: ctx.docs.length, open: total });

  return (
    <div className="home2">
      <header className="home2-head">
        <h1 className="greeting">{first ? t("home.greeting", { name: first }) : t("home.greetingNoName")}</h1>
        <p className="meta">{status}</p>
      </header>

      <section aria-labelledby="do-h" className="section">
        <h2 id="do-h" className="h3">{t("home2.do")}</h2>
        <ul className="tiles">
          {TILES.map(({ href, key, Icon }) => (
            <li key={key}><Link href={href} className="tile"><span className="tile-ic" aria-hidden="true"><Icon size={22} /></span>
              <span className="tile-txt"><strong>{t(`home2.tile.${key}`)}</strong><span>{t(`home2.tile.${key}.line`)}</span></span></Link></li>
          ))}
        </ul>
      </section>

      <div className="home2-grid">
        <section aria-labelledby="attn-h" className="card attn-card">
          <div className="section-head"><h2 id="attn-h" className="h3">{t("home.attention.title")}</h2>
            {total > 0 && <Link href="/documents?status=open" className="text-link">{t("home2.seeAll", { n: total })}</Link>}</div>
          {rows.length === 0 ? (
            <p className="all-clear"><CircleCheck size={20} aria-hidden="true" /> {ctx.docs.length === 0 ? t("home2.clear.empty") : t("home2.clear")}</p>
          ) : (
            <ul className="attn-list">
              {rows.map((r) => (
                <li key={r.title}>
                  <div className="attn-txt">
                    <strong lang={hasTelugu(r.title) ? "te" : undefined}>{r.title}</strong>
                    <span className="meta">{t(`home2.reason.${r.status}`)}{r.copies > 1 ? ` · ${t("home2.copies", { n: r.copies, open: r.open })}` : ""}</span>
                  </div>
                  <Link href={`/doc/${r.docId}`} className="btn secondary btn-small" aria-label={`${t(ACTION[r.status])}: ${r.title}`}>{t(ACTION[r.status])}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <ReadyCard packs={packs} />
      </div>

      <section aria-labelledby="docs-h" className="section">
        <div className="section-head">
          <h2 id="docs-h" className="h3">{t("home.docsTitle")}</h2>
          {ctx.docs.length > 0 && <Link href="/documents" className="text-link">{t("home2.allDocs", { n: ctx.docs.length })}</Link>}
        </div>
        {recent.length === 0 ? (
          <div className="empty-state"><FilePlus2 size={28} aria-hidden="true" /><p>{t("home2.empty")}</p><Link href="/add" className="btn">{t("home.addTitle")}</Link></div>
        ) : (
          <ul className="doc-list compact">
            {recent.map((d) => (
              <li key={d.id} className="doc-row">
                <span className="doc-title"><DocIcon type={d.doc_type} />
                  <Link href={`/doc/${d.id}`} aria-label={`${t("home.open")}: ${d.title}`} lang={hasTelugu(d.title) ? "te" : undefined}>{d.title}</Link></span>
                <span className="meta">{d.issuer ?? t("vault.noIssuer")}</span>
                <span><StatusChip status={statusOfDoc(d, ctx)} t={t} /></span>
              </li>
            ))}
          </ul>
        )}
        {ctx.docs.some((d) => statusOfDoc(d, ctx) === "unchecked") && <p><Link href="/verify" className="btn secondary btn-small">{t("home2.checkAll")}</Link></p>}
      </section>

      <p className="home2-foot meta"><Link href="/features">{t("features.link")}</Link> · <Link href="/demo">{t("demo.link")}</Link></p>
    </div>
  );
}
