"use client";
/**
 * VERIFY PANEL — ask the SIMULATED ISSUER about one document and show the answer.
 *
 * Plain-English picture:
 *   "Verify with issuer" calls POST /api/verify (the server decides; this panel only displays).
 *   If the issuer cannot be reached, the server answers "Unverified: issuer unreachable at HH:MM,
 *   retrying" plus the time of the next automatic retry. This panel waits until then and asks again
 *   (10 s, 30 s, 60 s, 120 s after the first failure); after the last one it says so and the person
 *   can press "Retry now" at any time.
 *   Shown states: verified, doesn't match (with the exact fields, in neutral words), signature check
 *   failed, revoked/replaced by the issuer, unreachable, and stale (older than 24 hours).
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { VerifyOutcome } from "@/lib/verify";
import { showTime } from "@/lib/i18n-core";
import { post } from "./api";
import { StateBadge } from "./Badges";
import { Explain } from "./Explain";
import { useI18n } from "./I18n";
import { announce } from "./Live";
import { SealMoment } from "./SealMoment";

interface Props { docId: string; title: string; initial?: VerifyOutcome }

export function VerifyPanel({ docId, title, initial }: Props) {
  const { lang, t, fieldLabel } = useI18n();
  const router = useRouter();
  const [outcome, setOutcome] = useState<VerifyOutcome | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [seal, setSeal] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async (retry?: { first_failure_at: string; attempts_made: number }) => {
    clearTimeout(timer.current);
    setBusy(true);
    setProblem(null);
    announce(t("verify.checking", { title }));
    const r = await post<VerifyOutcome & { error?: string; unconfirmed?: string[] }>("/api/verify", { document_id: docId, ...(retry ?? {}) });
    setBusy(false);
    if (r.offline) { setProblem(t("api.offline")); announce(t("api.offline")); return; }
    if (!r.ok) {
      const extra = r.data.unconfirmed?.length ? ` (${r.data.unconfirmed.map((f) => fieldLabel(f)).join(", ")})` : "";
      const msg = r.status === 409 ? `${t("verify.confirmFirst")}${extra}` : r.data.error ?? t("api.failed");
      setProblem(msg);
      announce(msg);
      return;
    }
    const o = r.data;
    setOutcome(o);
    if (o.state === "verified") setSeal(true); // the scan-and-stamp moment
    announce(t("verify.result", { title, state: t(`state.${o.state}`) }));
    router.refresh();
    // Unreachable: schedule the next automatic retry at the time the server gave.
    if (o.retry && !o.retry.exhausted && o.retry.nextRetryAt) {
      const wait = Math.max(0, Date.parse(o.retry.nextRetryAt) - Date.now());
      const next = { first_failure_at: o.retry.firstFailureAt, attempts_made: o.retry.attemptsMade + 1 };
      timer.current = setTimeout(() => run(next), wait);
    }
  };

  const o = outcome;
  const unreachable = o?.state === "unverifiable" && o.retry;
  return (
    <div className="verify-panel">
      {seal && <SealMoment onDone={() => setSeal(false)} />}
      <p className="verify-state">
        {o ? <StateBadge state={o.state} t={t} /> : <StateBadge state="not_checked" t={t} />}
        {o?.freshness === "stale" && <span className="badge state-stale">{t("verify.staleBadge")}</span>}
      </p>
      {o?.state === "tamper_flagged" && o.mismatchedFields.length > 0 && (
        <div className="callout neutral">
          <p>{t("verify.neutral", { fields: o.mismatchedFields.map((f) => fieldLabel(f)).join(", ") })}</p>
          <ul className="diff-fields" aria-label={t("verify.differingFields")}>
            {o.mismatchedFields.map((f) => <li key={f}><code>{fieldLabel(f)}</code></li>)}
          </ul>
        </div>
      )}
      {o?.signatureValid === false && <p className="callout neutral">{t("verify.forged")}</p>}
      {o?.issuerUpdate && (
        <p className="callout neutral">{t("verify.issuerUpdate", { mine: o.issuerUpdate.matchesVersion, latest: o.issuerUpdate.latestVersion,
          fields: o.issuerUpdate.changedFields.map((f) => fieldLabel(f)).join(", ") })}</p>
      )}
      {unreachable && o.retry && (
        <p className="callout neutral">{o.retry.exhausted ? t("verify.retriesDone") : o.retry.nextRetryAt
          ? t("verify.nextRetry", { time: showTime(o.retry.nextRetryAt), n: o.retry.attemptsMade + 1 }) : null}</p>
      )}
      {problem && <p className="callout warn">{problem}</p>}
      {o && (
        <details className="expert">
          <summary>{t("ui.experts")}</summary>
          <Explain explanation={o.explanation} kind="verification" targetId={docId} hideReason={o.state === "tamper_flagged" && o.mismatchedFields.length > 0} />
        </details>
      )}
      <div className="row">
        <button type="button" disabled={busy} onClick={() => run()} aria-describedby={`vt-${docId}`}>
          {busy ? t("verify.busy") : !o ? t("verify.run") : o.state === "unverifiable" ? t("verify.retryNow") : t("verify.again")}
        </button>
        <span id={`vt-${docId}`} className="sr-only">{title}</span>
      </div>
    </div>
  );
}
