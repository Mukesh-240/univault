/**
 * MY SHARES — every share, its state, every attempt to open it, and the controls:
 * Kill this link, Kill all links, Test this link now, and the issuer re-check.
 * State and access history come straight from the append-only tables (share-store.ts).
 */
import Link from "next/link";
import { getI18n } from "@/lib/i18n-server";
import { itemLabel, showTime } from "@/lib/i18n";
import { DEMO_OWNER } from "@/lib/server";
import { loadShares } from "@/lib/share-store";
import { supabase } from "@/lib/supabase";
import { KillAll, Recheck, ShareActions } from "./ShareActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SharesPage() {
  const { lang, t } = await getI18n();
  const shares = await loadShares(supabase, DEMO_OWNER);
  return (
    <>
      <h1>{t("shares.title")}</h1>
      <p className="lead">{t("shares.intro")}</p>
      <div className="panel row">
        <Link href="/share">{t("shares.new")}</Link>
        <KillAll disabled={!shares.some((s) => s.state === "active")} />
      </div>
      <Recheck />
      {shares.length === 0 ? <p>{t("shares.none")}</p> : (
        <ul className="cards">
          {shares.map((s) => {
            const opened = s.accesses.filter((a) => a.outcome === "allowed").length;
            return (
              <li key={s.id} className="card" id={`share-${s.id}`}>
                <h2 className="h3">{s.recipientName} <code>{s.recipientCode}</code></h2>
                <p className="meta">
                  <span className={`badge share-${s.state}`}>{t(`shareState.${s.state}`)}</span>
                  {t("shares.meta", { purpose: s.purpose, until: showTime(s.expiresAt), policy: t(s.policy.mode === "view_only" ? "share.viewOnly" : "share.download") })}
                </p>
                <p>{t("shares.items")}: {s.fields.map((f) => itemLabel(lang, f)).join(", ")}</p>
                <p><strong>{t("shares.count", { opened, total: s.accesses.length })}</strong></p>
                <ShareActions shareId={s.id} active={s.state === "active"} />
                {s.accesses.length > 0 && (
                  <details>
                    <summary>{t("shares.history")}</summary>
                    <table>
                      <thead><tr><th scope="col">{t("shares.when")}</th><th scope="col">{t("shares.outcome")}</th><th scope="col">{t("shares.session")}</th><th scope="col">{t("shares.device")}</th><th scope="col">{t("shares.notified")}</th></tr></thead>
                      <tbody>
                        {s.accesses.map((a, i) => (
                          <tr key={i}><td>{showTime(a.at)}</td><td>{t(`outcome.${a.outcome}`)}</td><td>{a.session ?? "—"}</td><td><code>{a.device ?? "—"}</code></td><td>{a.notify ? t(`notifyKind.${a.notify}`) : "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
