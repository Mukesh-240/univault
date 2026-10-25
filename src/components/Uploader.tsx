"use client";
/**
 * UPLOADER — add a real document from a PDF or a photo, in three short steps:
 *   1  Pick the file     a PDF, a photo from the gallery, or (on phones) take a photo now;
 *   2  Check the details  the text is read for you (a PDF's own text on the server; a photo with the text reader in
 *                         this browser) and shown as details you can fix, remove or add to;
 *   3  Save               the details and the original file go into your vault as "uploaded by you, not checked yet".
 * Photos are made smaller here first (at most 1600 px, JPEG), so they upload quickly and fit the size limit.
 * Nothing is saved until "Save to my documents". Nothing here decides anything: the person checks every detail.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { keyFor, readFields, type ReadField } from "@/lib/read-fields";
import { useI18n } from "./I18n";
import { announce } from "./Live";
import { Stepper } from "./Steps";

const TYPES = ["degree_certificate", "provisional_certificate", "marksheet", "id_card", "income_certificate", "school_certificate", "other_document"] as const;
const MAX_BYTES = 700 * 1024;
const MAX_SIDE = 1600;

interface Picked { kind: "pdf" | "photo"; name: string; b64: string; preview?: string }
type Row = ReadField & { id: number };

/** A photo, made smaller: longest side at most 1600 px, saved as JPEG. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const q of [0.8, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", q));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("too_big");
}
const toB64 = async (b: Blob) => { const bytes = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

export function Uploader() {
  const { t, fieldLabel, docTypeLabel } = useI18n();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]>("degree_certificate");
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const nextId = useRef(1);
  const label = (k: string) => (k === "other_document" ? t("doctype.other") : docTypeLabel(k));
  const step = saved ? 3 : picked ? 2 : 1;

  const fail = (m: string) => { setError(m); setBusy(null); announce(m); };
  const toRows = (f: ReadField[]) => f.map((x) => ({ ...x, id: nextId.current++ }));

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setRows([]); setText([]); setSaved(null);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    try {
      if (isPdf) {
        if (file.size > MAX_BYTES) return fail(t("up.err.big"));
        setBusy(t("up.readingPdf"));
        const res = await fetch("/api/upload/read", { method: "POST", headers: { "content-type": "application/pdf" }, body: file });
        const data = await res.json() as { error?: string; lines?: string[]; fields?: ReadField[]; hasText?: boolean };
        if (!res.ok) return fail(data.error ?? t("api.failed"));
        setPicked({ kind: "pdf", name: file.name, b64: await toB64(file) });
        setText(data.lines ?? []); setRows(toRows(data.fields ?? []));
        announce(data.hasText ? t("up.readDone", { n: data.fields?.length ?? 0 }) : t("up.noText"));
      } else if (/^image\//.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)) {
        setBusy(t("up.shrinking"));
        const small = await shrinkPhoto(file);
        setPicked({ kind: "photo", name: file.name, b64: await toB64(small), preview: URL.createObjectURL(small) });
        setBusy(t("up.readingPhoto", { pct: 0 }));
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker(["eng", "tel"], undefined, { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") setBusy(t("up.readingPhoto", { pct: Math.round(m.progress * 100) })); } });
        const { data } = await worker.recognize(small, {}, { blocks: true });
        await worker.terminate();
        type Block = { paragraphs: { lines: { text: string; confidence: number }[] }[] };
        const lines = ((data.blocks ?? []) as unknown as Block[]).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), confidence: Math.max(0, Math.min(1, l.confidence / 100)) })))).filter((l) => l.text);
        const found = readFields(lines);
        setText(lines.map((l) => l.text)); setRows(toRows(found));
        announce(t("up.readDone", { n: found.length }));
      } else return fail(t("up.err.kind"));
    } catch (e) {
      return fail(e instanceof Error && e.message === "too_big" ? t("up.err.big") : t("up.err.read"));
    }
    setBusy(null);
  };

  const addRow = () => {
    const key = keyFor(newLabel);
    if (!key || rows.some((r) => r.key === key)) { fail(t("up.err.label")); return; }
    setRows([...rows, { id: nextId.current++, key, label: newLabel.trim(), value: "" }]); setNewLabel(""); setError(null);
  };

  const save = async () => {
    if (!picked) return;
    const fields = Object.fromEntries(rows.filter((r) => r.value.trim()).map((r) => [r.key, r.value.trim()]));
    if (!Object.keys(fields).length) return fail(t("up.err.none"));
    setBusy(t("up.saving")); setError(null);
    const conf = Object.fromEntries(rows.filter((r) => r.confidence !== undefined && fields[r.key]).map((r) => [r.key, r.confidence!]));
    const res = await fetch("/api/upload/document", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      doc_type: type, title: title.trim() || label(type), issuer: issuer.trim() || undefined, fields,
      capture: picked.kind === "photo" ? "scan" : "digital", ...(picked.kind === "photo" ? { ocr_confidence: conf } : {}), file: { b64: picked.b64 },
    }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) as { id?: string; error?: string } : {};
    if (!res || !res.ok || !data.id) return fail(data.error ?? t("api.failed"));
    setSaved(data.id); setBusy(null); announce(t("up.saved"));
  };

  return (
    <div className="stack">
      <Stepper steps={["up.step.1", "up.step.2", "up.step.3"]} current={step} here={`up.step.${step}.here`} next={step < 3 ? `up.step.${step}.next` : undefined} />
      {saved ? (
        <div className="card stack-s">
          <p className="callout ok" role="status">{t("up.saved")}</p>
          <div className="card-actions">
            <Link href={`/doc/${saved}`} className="btn">{t("up.open")}</Link>
            <button type="button" className="secondary" onClick={() => { setPicked(null); setRows([]); setText([]); setSaved(null); setTitle(""); setIssuer(""); }}>{t("up.another")}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="card stack-s">
            <div className="row">
              <label className="btn" htmlFor="up-photo">{t("up.takePhoto")}</label>
              <input id="up-photo" className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0])} />
              <label className="btn secondary" htmlFor="up-file">{t("up.chooseFile")}</label>
              <input id="up-file" className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            <p className="meta">{t("up.limits")}</p>
            {busy && <p className="callout neutral" role="status">{busy}</p>}
            {error && <p className="callout warn" role="alert">{error}</p>}
          </div>

          {picked && !busy && (
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
              <h2 className="h3">{t("up.checkTitle")}</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {picked.preview && <img src={picked.preview} alt={t("up.previewAlt")} className="up-preview" />}
              {picked.kind === "pdf" && <p className="meta">{t("up.pdfName", { name: picked.name })}</p>}
              {rows.length === 0 && <p className="callout neutral">{t("up.noFields")}</p>}
              <div className="field">
                <label htmlFor="up-type">{t("add.file.type")}</label>
                <select id="up-type" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
                  {TYPES.map((k) => <option key={k} value={k}>{label(k)}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="up-title">{t("add.file.docTitle")}</label><input id="up-title" value={title} placeholder={label(type)} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
              <div className="field"><label htmlFor="up-issuer">{t("up.issuer")}</label><input id="up-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} maxLength={200} /></div>
              <fieldset>
                <legend>{t("up.details")}</legend>
                {rows.map((r) => (
                  <div className="field up-row" key={r.id}>
                    <label htmlFor={`up-f-${r.id}`}>{fieldLabel(r.key) !== r.key ? fieldLabel(r.key) : r.label}
                      {r.confidence !== undefined && <span className="meta"> · {t("review.readerSure", { pct: Math.round(r.confidence * 100) })}</span>}</label>
                    <div className="row">
                      <input id={`up-f-${r.id}`} value={r.value} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)))} maxLength={500} />
                      <button type="button" className="text" onClick={() => setRows(rows.filter((x) => x.id !== r.id))}>{t("up.remove")}</button>
                    </div>
                  </div>
                ))}
                <div className="row">
                  <label htmlFor="up-new" className="sr-only">{t("up.newLabel")}</label>
                  <input id="up-new" value={newLabel} placeholder={t("up.newLabel")} onChange={(e) => setNewLabel(e.target.value)} maxLength={60} />
                  <button type="button" className="secondary" onClick={addRow} disabled={!newLabel.trim()}>{t("up.addDetail")}</button>
                </div>
              </fieldset>
              {text.length > 0 && <details className="expert"><summary>{t("up.allText")}</summary><pre className="up-text">{text.join("\n")}</pre></details>}
              <p className="note">{t("up.notChecked")}</p>
              <button type="submit">{t("up.save")}</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
