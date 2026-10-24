"use client";
/**
 * SHARE CONTROLS — buttons that call the share routes and announce the answer:
 *   StopShare    "Stop sharing" for one share, after a confirm sentence ("This link will stop working for
 *                everyone. You can create a new one.") with "Stop sharing" / "Keep sharing";
 *   ShareActions StopShare plus "Test this link now" (asks the server what the link would do right now);
 *   KillAll      "Stop all sharing" (kept on the More page, away from the normal button);
 *   Recheck      "Check now", also repeated every 60 s while this page is open, listing every share that
 *                still uses a record the issuer has since replaced or revoked.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmButton } from "@/components/ConfirmDialog";
import { StateBadge } from "@/components/Badges";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { post } from "@/components/api";

const RECHECK_EVERY_MS = 60_000;

export function StopShare({ shareId, name, onDone }: { shareId: string; name: string; onDone?: (m: string) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const kill = async () => {
    const r = await post<{ killed: string[] }>("/api/shares/kill", { share_id: shareId });
    const m = r.offline ? t("api.offline") : r.ok ? t("shares.killed") : t("api.failed");
    announce(m); onDone?.(m);
    if (r.ok) router.refresh();
  };
  return <ConfirmButton label={t("shares.kill")} title={t("shares.confirm.title", { name })} body={t("shares.confirm.body")} yes={t("shares.confirm.yes")} no={t("shares.confirm.no")} onConfirm={kill} />;
}

export function ShareActions({ shareId, active, name }: { shareId: string; active: boolean; name: string }) {
  const { t } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  const say = (m: string) => { setMsg(m); announce(m); };
  const test = async () => {
    const r = await post<{ result: string }>("/api/shares/test", { share_id: shareId });
    say(r.offline ? t("api.offline") : r.ok ? t("shares.testResult", { result: t(`outcome.${r.data.result}`) }) : t("api.failed"));
  };
  return (
    <div className="card-actions">
      {active && <StopShare shareId={shareId} name={name} onDone={setMsg} />}
      <button type="button" className="text" onClick={test}>{t("shares.test")}</button>
      {msg && <span className="test-result" role="status">{msg}</span>}
    </div>
  );
}

export function KillAll({ disabled }: { disabled: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const kill = async () => {
    const r = await post<{ killed: string[] }>("/api/shares/kill", { all: true });
    const m = r.offline ? t("api.offline") : r.ok ? t("shares.killedAll", { n: r.data.killed.length }) : t("api.failed");
    setMsg(m); announce(m);
    if (r.ok) router.refresh();
  };
  return (
    <div className="stack-s">
      <ConfirmButton className="danger" disabled={disabled} label={t("shares.killAll")} title={t("shares.confirmAll.title")} body={t("shares.confirmAll.body")} yes={t("shares.confirmAll.yes")} no={t("shares.confirm.no")} onConfirm={kill} />
      {msg && <p className="test-result" role="status">{msg}</p>}
    </div>
  );
}

interface Affected { document_id: string; title: string; state: string; reason: string; shares: { id: string; recipient: string; purpose: string }[] }

export function Recheck() {
  const { t } = useI18n();
  const [result, setResult] = useState<{ checked: number; affected: Affected[]; checked_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    const r = await post<{ checked: number; affected: Affected[]; checked_at: string }>("/api/recheck", {});
    setBusy(false);
    if (!r.ok) return;
    setResult(r.data);
    if (r.data.affected.length) announce(t("recheck.affected", { n: r.data.affected.length }));
  }, [t]);
  useEffect(() => { const id = setInterval(run, RECHECK_EVERY_MS); return () => clearInterval(id); }, [run]);
  return (
    <section className="card" aria-labelledby="rc-h">
      <h2 id="rc-h" className="h3">{t("recheck.title")}</h2>
      <p className="note">{t("recheck.intro")}</p>
      <button type="button" className="secondary" onClick={run} disabled={busy}>{busy ? t("verify.busy") : t("recheck.run")}</button>
      {result && (result.affected.length === 0 ? <p>{t("recheck.none", { n: result.checked })}</p> : (
        <ul>
          {result.affected.map((a) => (
            <li key={a.document_id}>{a.title}: <StateBadge state={a.state} t={t} /> {t("recheck.shares", { list: a.shares.map((s) => `${s.recipient} (${s.purpose})`).join(", ") })}</li>
          ))}
        </ul>
      ))}
    </section>
  );
}
