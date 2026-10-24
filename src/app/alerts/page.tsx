/**
 * ALERTS — what has happened to your shared links, as plain sentences, newest first:
 * "Someone entered a wrong code for the link to Example Hiring Co. at 14:22 UTC."
 * Each alert about a link that is still working has a "Stop this link" button (with the same confirm
 * sentence as on My shares). Alerts come from the access log and from issuer re-checks (share-store.ts).
 */
import Link from "next/link";
import { getI18n } from "@/lib/i18n-server";
import { showTime } from "@/lib/i18n";
import { DEMO_OWNER } from "@/lib/server";
import { requestsToHolder, reportsAboutHolder } from "@/lib/receiver-portal";
import { listNotifications, loadShares } from "@/lib/share-store";
import { supabase } from "@/lib/supabase";
import { StopShare } from "../shares/ShareActions";
import { eligibilityRequests, packFor } from "@/lib/eligibility";
import { loadPacks } from "@/lib/rules";
import { DeclineRequest, EligibilityAnswer } from "./AlertForms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AlertsPage() {
  const { t } = await getI18n();
  const [alerts, shares] = await Promise.all([listNotifications(supabase, DEMO_OWNER, 50), loadShares(supabase, DEMO_OWNER)]);
  const byId = new Map(shares.map((s) => [s.id, s]));
  // What receivers have asked this person for, and problems they reported (fixed reasons, no free text).
  const eligibility = (await eligibilityRequests(supabase, { to: DEMO_OWNER })).filter((e) => e.status === "waiting");
  const packs = loadPacks();
  const [requests, reports, names] = await Promise.all([
    requestsToHolder(supabase, DEMO_OWNER), reportsAboutHolder(supabase, DEMO_OWNER), supabase.from("recipients").select("recipient_code, name"),
  ]);
  const nameOf = new Map(((names.data ?? []) as { recipient_code: string; name: string }[]).map((r) => [r.recipient_code, r.name]));
  return (
    <>
      <h1>{t("alerts.title")}</h1>
      <p className="lead">{t("alerts.intro")}</p>
      <section aria-labelledby="req-h" className="stack-s" style={{ marginBottom: "var(--s4)" }}>
        <h2 id="req-h">{t("sender.requests.title")}</h2>
        {requests.length === 0 ? <p className="card">{t("sender.requests.none")}</p> : (
          <ul className="cards">
            {requests.slice(0, 8).map((r) => (
              <li key={r.id} className="card">
                <p className="big">{t("sender.requests.from", { name: nameOf.get(r.from) ?? r.from, n: r.items.length })}</p>
                <p className="meta">{showTime(r.at)}</p>
                {r.flagged && <p className="callout warn">{t("sender.requests.flagged")}</p>}
                <div className="card-actions">{r.declined ? <span className="chip warn">{t("sender.requests.declined")}</span> : <><Link className="btn secondary" href={`/share?to=${encodeURIComponent(r.from)}&ask=${encodeURIComponent(r.items.join(","))}`}>{t("sender.requests.share")}</Link><DeclineRequest id={r.id} /></>}</div>
              </li>
            ))}
          </ul>
        )}
        <h2 id="elig-h" style={{ marginTop: "var(--s3)" }}>{t("elig.sender.title")}</h2>
        {eligibility.length === 0 ? <p className="card">{t("elig.sender.none")}</p> : (
          <ul className="cards">
            {eligibility.map((e) => {
              const pack = packs.find((p) => p.id === e.packId);
              return (
                <li key={e.id} className="card">
                  <p className="big">{t("elig.sender.from", { name: nameOf.get(e.from) ?? e.from, n: pack?.rules.length ?? 0, pack: pack?.title ?? "" })}</p>
                  <p className="meta">{showTime(e.at)}</p>
                  <EligibilityAnswer id={e.id} criteria={(pack?.rules ?? []).map((r) => ({ id: r.id, label: r.label }))} />
                </li>
              );
            })}
          </ul>
        )}
        {reports.length > 0 && (
          <>
            <h3>{t("sender.reports.title")}</h3>
            <ul className="cardlist">{reports.slice(0, 5).map((r, i) => <li key={i} className="card">{t("sender.reports.item", { name: nameOf.get(r.code) ?? r.code, reason: t(`recv.report.${r.reason}`) })} <span className="meta">{showTime(r.at)}</span></li>)}</ul>
          </>
        )}
      </section>
      {alerts.length === 0 ? <p className="card">{t("alerts.none")}</p> : (
        <ul className="cards">
          {alerts.map((a) => {
            const share = a.shareId ? byId.get(a.shareId) : undefined;
            const time = showTime(a.at);
            const text = a.kind === "issuer_change"
              ? t("alert.issuer_change", { title: String(a.detail.title ?? ""), time, n: Array.isArray(a.detail.share_ids) ? a.detail.share_ids.length : 0 })
              : t(`alert.${a.kind}`, { name: share?.recipientName ?? a.recipientCode ?? "", purpose: a.purpose ?? "", time });
            return (
              <li key={a.id} className="card">
                <p>{text}</p>
                <div className="card-actions">
                  {share && (share.state === "active" ? <StopShare shareId={share.id} name={share.recipientName} /> : <span className="meta">{t("alert.already")}</span>)}
                  {a.kind === "issuer_change" && <Link href="/shares" className="btn secondary">{t("alert.review")}</Link>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
