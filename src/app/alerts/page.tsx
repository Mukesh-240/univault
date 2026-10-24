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
import { listNotifications, loadShares } from "@/lib/share-store";
import { supabase } from "@/lib/supabase";
import { StopShare } from "../shares/ShareActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AlertsPage() {
  const { t } = await getI18n();
  const [alerts, shares] = await Promise.all([listNotifications(supabase, DEMO_OWNER, 50), loadShares(supabase, DEMO_OWNER)]);
  const byId = new Map(shares.map((s) => [s.id, s]));
  return (
    <>
      <h1>{t("alerts.title")}</h1>
      <p className="lead">{t("alerts.intro")}</p>
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
