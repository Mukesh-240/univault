/**
 * /issuer — the issuer dashboard: how many documents are active, waiting for the holder to check, stopped or
 * replaced, the recent activity, and ONE big button: "Issue a document". It shows only this issuer own records.
 */
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { currentSession } from "@/lib/auth-server";
import { docTypeLabel, showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { issuerActivity, listIssued } from "@/lib/issuer-portal";
import { supabase } from "@/lib/supabase";
import { ActivityList } from "./ActivityList";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function IssuerHome() {
  const { lang, t } = await getI18n();
  const issuer = (await currentSession())?.ref ?? "";
  const [rows, activity] = await Promise.all([listIssued(supabase, issuer), issuerActivity(supabase, issuer, 6)]);
  const stats = [
    { key: "issued", n: rows.filter((r) => r.status === "active").length, tone: "ok" },
    { key: "waiting", n: rows.filter((r) => r.waiting).length, tone: "unk" },
    { key: "stopped", n: rows.filter((r) => r.status === "revoked").length, tone: "bad" },
    { key: "replaced", n: rows.filter((r) => r.status === "superseded").length, tone: "warn" },
  ];
  return (
    <>
      <section className="hero role-issuer">
        <h1>{t("issuer.welcome", { name: issuer })}</h1>
        <p className="lead">{t("issuer.sub")}</p>
        <Link href="/issuer/issue" className="btn"><FilePlus2 size={22} aria-hidden="true" /> {t("issuer.btn.issue")}</Link>
      </section>
      <section aria-label={t("issuer.title")} className="stat-grid">
        {stats.map((s) => (
          <article key={s.key} className={`card stat stat-${s.tone}`}>
            <p className="stat-n tabular"><span className="count" style={{ ["--to" as string]: s.n }} aria-hidden="true" /><span className="sr-only">{s.n}</span></p>
            <p className="meta">{t(`issuer.stat.${s.key}`)}</p>
          </article>
        ))}
      </section>
      <section aria-labelledby="rec-h" className="stack-s">
        <h2 id="rec-h">{t("issuer.recent")}</h2>
        <ActivityList items={activity.map((a) => ({ ...a, when: showTime(a.at), type: a.docType ? docTypeLabel(lang, a.docType) : "" }))} />
        <Link href="/issuer/activity" className="btn secondary">{t("nav.issuer.side.activity")}</Link>
      </section>
    </>
  );
}
