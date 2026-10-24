"use client";
/**
 * FIELD REVIEW — confirm or correct the text read from a photo, one field at a time, in big boxes.
 *
 * Plain-English picture:
 *   For every field the person sees what we read, in a big text box that cannot be changed by accident.
 *   "This is correct" agrees with the reading. "Let me fix it" opens the box for typing, and "Save my fix"
 *   stores the new value. The ORIGINAL reading is never changed: either choice stores a NEW, separate
 *   "assertion" row (field, old value, new value, author, time) through POST /api/feedback, and a ledger
 *   line records that it happened. Until then the field says "Not confirmed yet".
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { hasTelugu } from "@/lib/i18n-core";
import { post } from "./api";
import { useI18n } from "./I18n";
import { announce } from "./Live";
import { Reason } from "./Reason";
import { Chip } from "./StatusChip";

export interface ReviewField { name: string; original: string; asserted?: string; confidence?: number; hints: string[] }

export function FieldReview({ docId, fields, idPrefix }: { docId: string; fields: ReviewField[]; idPrefix: string }) {
  const { lang, t, fieldLabel } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const save = async (f: ReviewField, value: string) => {
    setBusy(f.name);
    const r = await post("/api/feedback", { target_kind: "ocr_field", target_id: docId, action: "override", field: f.name, value });
    setBusy(null);
    const label = fieldLabel(f.name);
    const msg = r.offline ? t("api.offline") : !r.ok ? t("api.failed")
      : value === f.original ? t("review.confirmedMsg", { field: label }) : t("review.correctedMsg", { field: label });
    announce(msg);
    if (r.ok) { setEditing(null); router.refresh(); }
  };

  const startFix = (f: ReviewField, inputId: string) => {
    setEditing(f.name);
    setDraft(f.asserted ?? f.original);
    requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  };

  return (
    <ul className="cardlist field-boxes" aria-label={t("review.caption")}>
      {fields.map((f) => {
        const inputId = `${idPrefix}-${f.name}`;
        const status = f.asserted === undefined ? "unconfirmed" : f.asserted === f.original ? "confirmed" : "corrected";
        const isEditing = editing === f.name;
        const shown = isEditing ? draft : f.asserted ?? f.original;
        return (
          <li key={f.name} className="field-box">
            <div className="card-head">
              <label htmlFor={inputId}><strong>{fieldLabel(f.name)}</strong></label>
              <Chip kind={status === "unconfirmed" ? "warn" : "ok"}>{t(`review.${status}`)}</Chip>
            </div>
            <input id={inputId} className="wide reading" value={shown} readOnly={!isEditing} lang={hasTelugu(shown) ? "te" : undefined}
              onChange={(e) => setDraft(e.target.value)} aria-describedby={`${inputId}-note`} />
            <p id={`${inputId}-note`} className="meta">
              {f.confidence !== undefined && <>{t("review.readerSure", { pct: Math.round(f.confidence * 100) })} </>}
              {f.hints.map((h) => <span key={h} className="hint"><Reason text={h} lang={lang} /> </span>)}
              {status !== "unconfirmed" && f.asserted !== f.original && <span className="layer">{t("review.original")}: <span className="original" lang={hasTelugu(f.original) ? "te" : undefined}>{f.original}</span></span>}
            </p>
            <div className="card-actions">
              {isEditing ? (
                <>
                  <button type="button" disabled={busy === f.name || !draft.trim()} onClick={() => save(f, draft)}>{t("review.saveFix")}</button>
                  <button type="button" className="text" onClick={() => setEditing(null)}>{t("review.cancel")}</button>
                </>
              ) : (
                <>
                  <button type="button" disabled={busy === f.name} onClick={() => save(f, f.original)}>{t("review.thisCorrect")}</button>
                  <button type="button" className="secondary" onClick={() => startFix(f, inputId)}>{t("review.letMeFix")}</button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
