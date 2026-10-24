"use client";
/**
 * ERASE MY DOCUMENT — shows the limits FIRST, then needs an explicit "I understand" before the
 * "Erase permanently" button works. Calls POST /api/erase, which revokes active shares that used the
 * document, deletes its content and records an "erased" event + ledger line.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";
import { useI18n } from "./I18n";
import { announce } from "./Live";
import { Stepper, StepTrail } from "./Steps";
import { eraseTrail } from "@/lib/trail";

export function EraseDocument({ docId, title }: { docId: string; title: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ sha256: string; ledgerSeq?: number } | null>(null);
  const panel = `erase-${docId}`;

  const erase = async () => {
    setBusy(true);
    const r = await post<{ revoked_shares?: string[]; sha256?: string; ledger_seq?: number }>("/api/erase", { document_id: docId, acknowledged: true });
    setBusy(false);
    announce(r.offline ? t("api.offline") : r.ok ? t("erase.done", { title, n: r.data.revoked_shares?.length ?? 0 }) : t("api.failed"));
    if (r.ok) { setDone({ sha256: r.data.sha256 ?? "", ledgerSeq: r.data.ledger_seq }); router.refresh(); }
  };

  if (done) return (
    <div className="erase">
      <Stepper steps={["stepper.erase.1", "stepper.erase.2", "stepper.erase.3"]} current={3} here="stepper.erase.3.here" />
      <StepTrail steps={eraseTrail(done)} id={`${panel}-trail-h`} />
    </div>
  );
  return (
    <div className="erase">
      <button type="button" className="btn-small secondary" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>{t("erase.open")}</button>
      {open && (
        <div id={panel} className="callout warn" role="region" aria-label={t("erase.limitsTitle")}>
          <Stepper steps={["stepper.erase.1", "stepper.erase.2", "stepper.erase.3"]} current={ack ? 2 : 1} here="stepper.erase.1.here" next="stepper.erase.1.next" />
          <p><strong>{t("erase.limitsTitle")}</strong></p>
          <ul><li>{t("erase.limit1")}</li><li>{t("erase.limit2")}</li><li>{t("erase.limit3")}</li></ul>
          <div className="toggle">
            <input type="checkbox" id={`${panel}-ack`} checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <label htmlFor={`${panel}-ack`}>{t("erase.ack")}</label>
          </div>
          <button type="button" disabled={!ack || busy} onClick={erase}>{t("erase.confirm", { title })}</button>
        </div>
      )}
    </div>
  );
}
