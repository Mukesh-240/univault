"use client";
/**
 * OCR WORKBENCH — the interactive half of the OCR page.
 *
 *   - A switch: use the SAVED Tesseract.js results (default; works with no network) or RUN Tesseract.js
 *     now in this browser (it downloads the English + Telugu language data the first time).
 *   - For each scan: the image beside the fields read from it, with a confidence per field and a
 *     "check this" hint where the reading looks risky.
 *   - "Add to vault": sends the reading through the normal upload route (POST /api/upload, the same
 *     ingestDocument() front door as every document). Then the confirm/correct table appears; fields
 *     stay "unconfirmed" until the person acts, and corrections never change the original reading.
 * Turning lines into fields uses src/lib/ocr-extract.ts — the same code that produced the saved results.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldReview, type ReviewField } from "@/components/FieldReview";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { Reason } from "@/components/Reason";
import { post } from "@/components/api";
import { hasTelugu } from "@/lib/i18n-core";
import { extractFields, type OcrLine } from "@/lib/ocr-extract";
import { reviewHints } from "@/lib/ocr";

export interface ScanItem { file: string; damage: string; lines: OcrLine[]; stored: { id: string; fields: ReviewField[] } | null }

type Mode = "saved" | "live";
interface Block { paragraphs: { lines: OcrLine[] }[] }

export function OcrWorkbench({ items, engine, created }: { items: ScanItem[]; engine: string; created: string }) {
  const { t, fieldLabel } = useI18n();
  const [mode, setMode] = useState<Mode>("saved");
  return (
    <>
      <ul className="cards">
        {items.map((it) => <li key={it.file} className="card"><ScanCard item={it} mode={mode} /></li>)}
      </ul>
      <details className="expert">
        <summary>{t("ui.experts")}: {t("ocr.modeLegend")}</summary>
        <fieldset>
          <legend>{t("ocr.modeLegend")}</legend>
          <div className="toggle">
            <input type="radio" id="mode-saved" name="ocr-mode" checked={mode === "saved"} onChange={() => setMode("saved")} />
            <label htmlFor="mode-saved">{t("ocr.modeSaved", { engine, date: created.slice(0, 10) })}</label>
          </div>
          <div className="toggle">
            <input type="radio" id="mode-live" name="ocr-mode" checked={mode === "live"} onChange={() => setMode("live")} />
            <label htmlFor="mode-live">{t("ocr.modeLive")}</label>
          </div>
        </fieldset>
      </details>
    </>
  );
}

function ScanCard({ item, mode }: { item: ScanItem; mode: Mode }) {
  const { lang, t, fieldLabel } = useI18n();
  const router = useRouter();
  const [lines, setLines] = useState<OcrLine[]>(item.lines);
  const [busy, setBusy] = useState<string | null>(null);
  const name = item.file.replace("scans/", "");
  const read = extractFields(lines);
  const headingId = `scan-${name}`;

  const runLive = async () => {
    setBusy(t("ocr.running"));
    announce(t("ocr.running"));
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["eng", "tel"]);
      const { data } = await worker.recognize(`/${item.file}`, {}, { blocks: true });
      await worker.terminate();
      const out = ((data.blocks ?? []) as unknown as Block[]).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), confidence: l.confidence }))));
      setLines(out);
      announce(t("ocr.liveDone", { n: Object.keys(extractFields(out)).length }));
    } catch {
      announce(t("ocr.liveFailed"));
    }
    setBusy(null);
  };

  const store = async () => {
    setBusy(t("ocr.storing"));
    const fields = Object.fromEntries(Object.entries(read).map(([k, v]) => [k, v.value]));
    const r = await post<{ id?: string; error?: string }>("/api/upload", {
      owner: "demo", doc_type: "marksheet", title: t("ocr.docTitle", { file: name }), issuer: null, serial: fields.serial ?? null,
      capture: "scan", fields, ocr_confidence: Object.fromEntries(Object.entries(read).map(([k, v]) => [k, v.confidence])),
      language_scripts: ["latin", "telugu"], synthetic: true,
      synthetic_origin: { generator: "univault-synthetic-lab/scans", version: "1.0.0", seed: 4242, recipe: `scans/${item.damage}`, dataset: "scans", ref: item.file },
    });
    setBusy(null);
    announce(r.offline ? t("api.offline") : r.ok ? t("ocr.stored") : r.data.error ?? t("api.failed"));
    if (r.ok) router.refresh();
  };

  // Review hints for a reading that is not stored yet (same rule as for stored scans).
  const hints = new Map(reviewHints({ id: "preview", doc_type: "marksheet", title: "", issuer: null, serial: null, capture: "scan",
    fields: Object.fromEntries(Object.entries(read).map(([k, v]) => [k, v.value])), ocr_confidence: Object.fromEntries(Object.entries(read).map(([k, v]) => [k, v.confidence])) })
    .map((h) => [h.field, h.why]));

  return (
    <article aria-labelledby={headingId}>
      <h2 id={headingId} className="h3">{t("ocr.scanTitle", { file: name, damage: item.damage })}</h2>
      <div className="ocr-grid">
        <img src={`/${item.file}`} alt={t("ocr.alt", { damage: item.damage })} width={900} height={520} />
        <div>
          {item.stored ? (
            <FieldReview docId={item.stored.id} fields={item.stored.fields} idPrefix={`ocr-${name}`} />
          ) : (
            <>
              <p className="note">{t("ocr.readCaption")}</p>
              <ul className="cardlist field-boxes">
                {Object.entries(read).map(([k, v]) => (
                  <li key={k} className="field-box">
                    <strong>{fieldLabel(k)}</strong>
                    <p className="reading" lang={hasTelugu(v.value) ? "te" : undefined}>{v.value}</p>
                    <p className="meta">{t("review.readerSure", { pct: Math.round(v.confidence * 100) })} {(hints.get(k) ?? []).map((h) => <span key={h} className="hint"><Reason text={h} lang={lang} /> </span>)}</p>
                  </li>
                ))}
              </ul>
              <div className="row">
                {mode === "live" && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={runLive}>{t("ocr.runLive")}</button>}
                <button type="button" disabled={Boolean(busy)} onClick={store}>{t("ocr.store")}</button>
                {busy && <span>{busy}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
