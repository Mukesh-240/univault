"use client";
/**
 * REPORT BOX — "Report a problem" with three fixed reasons (big radio cards, no free text, so nothing personal can
 * reach the append-only history). The sender sees the report on their Alerts page.
 */
import { useState } from "react";
import { post } from "@/components/api";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";

const REASONS = ["looks_wrong", "not_asked", "other"] as const;

export function ReportBox({ shareId }: { shareId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const send = async () => {
    const r = await post("/api/receive/report", { share_id: shareId, reason });
    const m = r.offline ? t("api.offline") : r.ok ? t("recv.report.done") : t("api.failed");
    setMsg(m); announce(m);
    if (r.ok) setOpen(false);
  };
  return (
    <section className="stack-s">
      {!open && <button type="button" className="secondary" onClick={() => setOpen(true)}>{t("recv.report.btn")}</button>}
      {open && (
        <fieldset className="radio-cards">
          <legend>{t("recv.report.title")}</legend>
          {REASONS.map((x) => <label key={x} className="radio-card"><input type="radio" name="reason" value={x} checked={reason === x} onChange={() => setReason(x)} /><span>{t(`recv.report.${x}`)}</span></label>)}
          <button type="button" disabled={!reason} onClick={send}>{t("recv.report.send")}</button>
        </fieldset>
      )}
      {msg && <p className="callout neutral" role="status">{msg}</p>}
    </section>
  );
}
