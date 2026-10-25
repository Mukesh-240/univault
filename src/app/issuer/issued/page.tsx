/**
 * /issuer/issued — everything this issuer has issued, newest first, with a search box and a status filter (big cards,
 * no dropdown). Each active document has "Stop this document" (with a confirm sentence) and "Issue corrected copy".
 * The filter and search are a plain form, so they work without JavaScript.
 */
import Link from "next/link";
import { BadgeCheck, CircleSlash, Clock, Replace, type LucideIcon } from "lucide-react";
import { currentSession } from "@/lib/auth-server";
import { docTypeLabel, showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { listIssued, type IssuedRow } from "@/lib/issuer-portal";
import { supabase } from "@/lib/supabase";
import { RevokeButton } from "./RevokeButton";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FILTERS = ["all", "active", "waiting", "revoked", "superseded"] as const;
type Filter = (typeof FILTERS)[number];
const parseFilter = (v: string | undefined): Filter => ((FILTERS as readonly string[]).includes(v ?? "") ? (v as Filter) : "all");

/** The one word a row is shown with: waiting (active, not yet checked), or its registry status. */
const labelOf = (r: IssuedRow): "active" | "waiting" | "revoked" | "superseded" => (r.status === "active" ? (r.waiting ? "waiting" : "active") : r.status);
const ICON: Record<string, { Icon: LucideIcon; cls: string }> = {
  active: { Icon: BadgeCheck, cls: "ok" }, waiting: { Icon: Clock, cls: "unk" }, revoked: { Icon: CircleSlash, cls: "bad" }, superseded: { Icon: Replace, cls: "warn" },
};

export default async function IssuedPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { lang, t } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 60).toLowerCase(), filter = parseFilter(sp.status);
  const issuer = (await currentSession())?.ref ?? "";
  const rows = (await listIssued(supabase, issuer)).filter((r) => (filter === "all" || labelOf(r) === filter)
    && (!q || r.serial.toLowerCase().includes(q) || docTypeLabel(lang, r.docType).toLowerCase().includes(q)));
  return (
    <>
      <PageHead title={t("issuer.issued.title")} purpose={t("issuer.issued.intro")} action={{ href: "/issuer/issue", label: t("issuer.btn.issue") }} />
      <form className="filter-form" method="get" action="/issuer/issued">
        <div className="field">
          <label htmlFor="iq">{t("home.search")}</label>
          <div className="search"><input id="iq" name="q" type="search" defaultValue={sp.q ?? ""} autoComplete="off" /><button type="submit">{t("home.searchBtn")}</button></div>
        </div>
        <fieldset className="radio-cards">
          <legend>{t("issuer.filter.legend")}</legend>
          {FILTERS.map((f) => (
            <label key={f} className="radio-card"><input type="radio" name="status" value={f} defaultChecked={filter === f} />{t(`issuer.filter.${f}`)}</label>
          ))}
        </fieldset>
      </form>
      {rows.length === 0 ? <p className="card">{t("issuer.issued.none")}</p> : (
        <ul className="cards doc-grid">
          {rows.map((r) => {
            const lab = labelOf(r);
            const { Icon, cls } = ICON[lab];
            return (
              <li key={r.serial} className="card">
                <div className="card-head">
                  <h3>{docTypeLabel(lang, r.docType)}</h3>
                  <span className={`chip ${cls}`}><Icon size={18} aria-hidden="true" /> {t(`issuer.status.${lab}`)}</span>
                </div>
                <p className="meta tabular">{t("issuer.col.serial")}: {r.serial}</p>
                {r.issuedAt && <p className="meta">{t("issuer.col.issued")}: {showTime(r.issuedAt)}</p>}
                {r.supersededBy && <p className="meta tabular">{t("issuer.replacedBy", { by: r.supersededBy })}</p>}
                {r.status === "active" && (
                  <div className="card-actions">
                    <Link href={`/issuer/issue?correct=${encodeURIComponent(r.serial)}`} className="btn secondary">{t("issuer.correct")}</Link>
                    <RevokeButton serial={r.serial} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
