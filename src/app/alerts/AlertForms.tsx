"use client";
/**
 * ALERT FORMS — what the holder can DO about what receivers asked:
 *   DeclineRequest    "Decline" a request for documents (logged; nothing is shared; the receiver sees "Declined");
 *   EligibilityAnswer authorise criteria ONE BY ONE, then "Run the check and send the result" (only the ticked criteria
 *                     are checked and shown; no document is shared), or "Decline".
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/components/api";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";

export function DeclineRequest({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  return <button type="button" className="secondary" onClick={async () => { const r = await post("/api/requests/decline", { request_id: id }); announce(r.ok ? t("sender.requests.declined") : t("api.failed")); if (r.ok) router.refresh(); }}>{t("sender.requests.decline")}</button>;
}

export function EligibilityAnswer({ id, criteria }: { id: string; criteria: { id: string; label: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [on, setOn] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (c: string) => setOn((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  const run = async () => {
    const r = await post<{ error?: string }>("/api/eligibility/answer", { request_id: id, authorised: on });
    const m = r.offline ? t("api.offline") : r.ok ? t("elig.sender.answered") : r.data.error ?? t("api.failed");
    setMsg(m); announce(m);
    if (r.ok) router.refresh();
  };
  const decline = async () => { const r = await post("/api/eligibility/decline", { request_id: id }); const m = r.ok ? t("elig.sender.declinedMsg") : t("api.failed"); setMsg(m); announce(m); if (r.ok) router.refresh(); };
  return (
    <div className="stack-s">
      <fieldset className="radio-cards">
        <legend>{t("elig.sender.authorise")}</legend>
        {criteria.map((c) => <label key={c.id} className="radio-card"><input type="checkbox" checked={on.includes(c.id)} onChange={() => toggle(c.id)} /><span>{c.label}</span></label>)}
      </fieldset>
      <p className="note">{t("elig.nodocs")}</p>
      {msg && <p className="callout neutral" role="status">{msg}</p>}
      <div className="card-actions">
        <button type="button" disabled={on.length === 0} onClick={run}>{t("elig.sender.run")}</button>
        <button type="button" className="secondary" onClick={decline}>{t("elig.sender.decline")}</button>
      </div>
    </div>
  );
}
