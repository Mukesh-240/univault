/**
 * MY SHARES — every link you shared, as a card: who, what they can see, until when, and whether it is
 * still working. "Stop sharing" asks first (a sentence of consequence, then "Stop sharing" / "Keep sharing").
 * "Stop all sharing" is NOT here beside it: it lives on the More page so it cannot be pressed by mistake.
 * Under "For experts" on each card: every attempt on the link (result, session, device fingerprint, whether
 * you were told). State and history come straight from the append-only tables (share-store.ts).
 */
import Link from "next/link";
import { Chip } from "@/components/StatusChip";
import { getI18n } from "@/lib/i18n-server";
import { itemLabel, showTime } from "@/lib/i18n";
import { DEMO_OWNER } from "@/lib/server";
import { loadShares } from "@/lib/share-store";
import { supabase } from "@/lib/supabase";
import { Recheck, ShareActions } from "./ShareActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KIND = { active: "ok", revoked: "bad", expired: "unk" } as const;

export default async function SharesPage() {
  const { lang, t } = await getI18n();
  const shares = await loadShares(supabase, DEMO_OWNER);
  return (
    <>
      <h1>{t("shares.title")}</h1>
      <p className="lead">{t("shares.intro")}</p>
      <p><Link href="/share" className="btn">{t("shares.new")}</Link></p>
      {shares.length === 0 ? <p className="card">{t("shares.none")}</p> : (
        <ul className="cards">
          {shares.map((s) => {
            const opened = s.accesses.filter((a) => a.outcome === "allowed").length;
            return (
              <li key={s.id} className="card" id={`share-${s.id}`}>
                <div className="card-head">
                  <h2 className="h3">{t("shares.for", { name: s.recipientName })}</h2>
                  <Chip kind={KIND[s.state as keyof typeof KIND] ?? "unk"}>{t(`shareState.${s.state}`)}</Chip>
                </div>
                <p>{t("shares.what", { items: s.fields.map((f) => itemLabel(lang, f)).join(", ") })}</p>
                <p className="meta">{s.purpose} · {t("shares.until", { until: showTime(s.expiresAt) })} · {t("shares.opened", { n: opened })}</p>
                <ShareActions shareId={s.id} active={s.state === "active"} name={s.recipientName} />
                {s.accesses.length > 0 && (
                  <details className="expert">
                    <summary>{t("ui.experts")}: {t("shares.history")}</summary>
                    <p className="meta"><code>{s.recipientCode}</code> · {t(s.policy.mode === "view_only" ? "share.viewOnly" : "share.download")}</p>
                    <div className="table-scroll">
                      <table>
                        <thead><tr><th scope="col">{t("shares.when")}</th><th scope="col">{t("shares.outcome")}</th><th scope="col">{t("shares.session")}</th><th scope="col">{t("shares.device")}</th><th scope="col">{t("shares.notified")}</th></tr></thead>
                        <tbody>
                          {s.accesses.map((a, i) => (
                            <tr key={i}><td>{showTime(a.at)}</td><td>{a.outcome === "denied:unintended_account" ? t("access.unintended", { by: a.by ?? "?", to: s.recipientCode }) : t(`outcome.${a.outcome}`)}</td><td>{a.session ?? "—"}</td><td><code>{a.device ?? "—"}</code></td><td>{a.notify ? t(`notifyKind.${a.notify}`) : "—"}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Recheck />
    </>
  );
}
