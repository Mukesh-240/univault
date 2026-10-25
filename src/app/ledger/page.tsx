/**
 * LEDGER — the hash-chained diary of everything that happened (newest first), a "Verify ledger" button
 * (recomputes every fingerprint via verify_ledger()), and the SQL anyone can run in the Supabase SQL
 * editor to see the database itself refuse to rewrite history.
 */
import { LedgerCheck } from "@/components/LedgerCheck";
import { getI18n } from "@/lib/i18n-server";
import { showTime } from "@/lib/i18n";
import { verify } from "@/lib/ledger";
import { supabase } from "@/lib/supabase";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHOWN = 150;

/** Run in the Supabase SQL editor. The error text comes from docs/sql/001_core_schema.sql (prevent_mutation). */
const SQL = `-- 1. Try to rewrite history. The database refuses:
update public.ledger set kind = 'tampered' where seq = 1;
-- ERROR:  Table ledger is append-only: UPDATE is not allowed

delete from public.documents;
-- ERROR:  Table documents is append-only: DELETE is not allowed

-- 2. Re-check the whole chain:
select * from public.verify_ledger();
-- ok = true, total = <number of lines>, broken_at = null`;

export default async function LedgerPage() {
  const { t } = await getI18n();
  const check = await verify(supabase);
  const rows = await supabase.from("ledger").select("seq, kind, payload, hash, created_at").order("seq", { ascending: false }).limit(SHOWN);
  const lines = (rows.data ?? []) as { seq: number; kind: string; payload: Record<string, unknown>; hash: string; created_at: string }[];
  return (
    <>
      <PageHead title={t("ledgerPage.title")} purpose={t("ledgerPage.intro")} links={[{ href: "/leak-trace", label: t("nav.leak") }, { href: "/faults", label: t("nav.faults") }, { href: "/assistant", label: t("nav.assistant") }]} />
      <section className="panel" aria-labelledby="lv-h">
        <h2 id="lv-h" className="h3">{t("ledger.title")}</h2>
        <p>{check.ok ? t("ledger.ok", { n: check.total }) : t("ledger.broken", { line: String(check.broken_at) })}</p>
        <LedgerCheck />
      </section>
      <section className="panel" aria-labelledby="sql-h">
        <h2 id="sql-h" className="h3">{t("ledgerPage.sqlTitle")}</h2>
        <p className="note">{t("ledgerPage.sqlNote")}</p>
        <pre className="sql" tabIndex={0} aria-label={t("ledgerPage.sqlTitle")}><code lang="en">{SQL}</code></pre>
      </section>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={t("ledgerPage.caption", { n: lines.length })}><table>
        <caption>{t("ledgerPage.caption", { n: lines.length })}</caption>
        <thead><tr><th scope="col">#</th><th scope="col">{t("shares.when")}</th><th scope="col">{t("ledgerPage.kind")}</th><th scope="col">{t("ledgerPage.details")}</th><th scope="col">{t("ledgerPage.hash")}</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.seq}><td>{l.seq}</td><td>{showTime(l.created_at)}</td><td><code>{l.kind}</code></td>
              <td className="payload"><code lang="en">{JSON.stringify(l.payload).slice(0, 160)}</code></td><td><code>{l.hash.slice(0, 12)}…</code></td></tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}
