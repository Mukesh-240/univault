"use client";
/**
 * FIELD REVIEW — confirm or correct the text OCR read from a scan, one field at a time.
 *
 * Plain-English picture:
 *   The ORIGINAL reading is shown read-only and is never changed. The person either presses
 *   "Confirm as read" (agreeing with the reading) or types the right value and presses "Save
 *   correction". Either way a NEW, separate "assertion" row is stored through POST /api/feedback
 *   (field, old value, new value, author, time), and a ledger line records that it happened.
 *   Until then every field is shown as "unconfirmed".
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fieldLabel, hasTelugu } from "@/lib/i18n";
import { post } from "./api";
import { useI18n } from "./I18n";
import { announce } from "./Live";
import { Reason } from "./Reason";

export interface ReviewField { name: string; original: string; asserted?: string; confidence?: number; hints: string[] }

export function FieldReview({ docId, fields, idPrefix }: { docId: string; fields: ReviewField[]; idPrefix: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (f: ReviewField, value: string) => {
    setBusy(f.name);
    const r = await post("/api/feedback", { target_kind: "ocr_field", target_id: docId, action: "override", field: f.name, value });
    setBusy(null);
    const label = fieldLabel(lang, f.name);
    const msg = r.offline ? t("api.offline") : !r.ok ? t("api.failed")
      : value === f.original ? t("review.confirmedMsg", { field: label }) : t("review.correctedMsg", { field: label });
    announce(msg);
    if (r.ok) router.refresh();
  };

  return (
    <table className="fields review">
      <caption>{t("review.caption")}</caption>
      <thead>
        <tr><th scope="col">{t("review.field")}</th><th scope="col">{t("review.original")}</th><th scope="col">{t("review.confidence")}</th><th scope="col">{t("review.yours")}</th></tr>
      </thead>
      <tbody>
        {fields.map((f) => {
          const inputId = `${idPrefix}-${f.name}`;
          const status = f.asserted === undefined ? "unconfirmed" : f.asserted === f.original ? "confirmed" : "corrected";
          return (
            <tr key={f.name}>
              <th scope="row">{fieldLabel(lang, f.name)}</th>
              <td><span className="original" lang={hasTelugu(f.original) ? "te" : undefined}>{f.original}</span></td>
              <td>
                {f.confidence === undefined ? "—" : f.confidence.toFixed(2)}
                {f.hints.map((h) => <div key={h} className="hint"><Reason text={h} lang={lang} /></div>)}
              </td>
              <td>
                <span className={`badge field-${status}`}>{t(`review.${status}`)}</span>
                <form className="review-form" onSubmit={(e) => { e.preventDefault(); save(f, String(new FormData(e.currentTarget).get("value") ?? "")); }}>
                  <label htmlFor={inputId} className="sr-only">{t("review.inputLabel", { field: fieldLabel(lang, f.name) })}</label>
                  <input id={inputId} name="value" defaultValue={f.asserted ?? f.original} lang={hasTelugu(f.asserted ?? f.original) ? "te" : undefined} />
                  <button type="button" className="btn-small" disabled={busy === f.name} onClick={() => save(f, f.original)}>{t("review.confirm")}</button>
                  <button type="submit" className="btn-small secondary" disabled={busy === f.name}>{t("review.save")}</button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
