"use client";
/**
 * ADD FILE FORM — pick the kind of document (big cards), name it, type its details one per line
 * ("Name: Asha Rao"), and add it. Sent to POST /api/upload, the same front door as every document.
 * Details are turned into field names like "date_of_birth" (letters, digits and underscores); a line whose
 * label has no English letters (a Telugu label) gets a neutral name like "detail_1". The document is
 * "user-uploaded" (no issuer serial number), so it appears under "Uploaded by me" and is not yet checked.
 */
import Link from "next/link";
import { useState } from "react";
import { post } from "@/components/api";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";


const TYPES = ["id_card", "degree_certificate", "marksheet", "income_certificate", "other"] as const;

/** "Date of birth: 01-02-2003" lines -> { date_of_birth: "01-02-2003" }. Unusable lines are skipped. */
export function parseDetails(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
    if (!m) continue;
    n++;
    const slug = m[1].toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const key = /^[a-z]/.test(slug) ? slug.slice(0, 40) : `detail_${n}`;
    if (!(key in out)) out[key] = m[2].slice(0, 500);
  }
  return out;
}

export function AddFileForm() {
  const { lang, t, docTypeLabel } = useI18n();
  const [type, setType] = useState<(typeof TYPES)[number]>("id_card");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  const label = (k: string) => (k === "other" ? t("doctype.other") : docTypeLabel(k));

  const submit = async () => {
    const fields = parseDetails(details);
    if (!Object.keys(fields).length) { setError(t("add.file.err.none")); announce(t("add.file.err.none")); return; }
    setBusy(true); setError(null);
    const r = await post<{ id?: string; error?: string }>("/api/upload", {
      owner: "demo", doc_type: type === "other" ? "other_document" : type, title: title.trim() || label(type), issuer: null, serial: null,
      capture: "digital", fields, language_scripts: [/[ఀ-౿]/.test(details) ? "telugu" : "latin"], synthetic: true,
    });
    setBusy(false);
    if (r.offline) { setError(t("api.offline")); return; }
    if (!r.ok || !r.data.id) { setError(r.data.error ?? t("api.failed")); return; }
    setAddedId(r.data.id); announce(t("add.file.done"));
  };

  if (addedId) {
    return (
      <div className="card stack-s">
        <p className="callout ok" role="status">{t("add.file.done")}</p>
        <div className="card-actions"><Link href={`/doc/${addedId}`} className="btn">{t("add.file.openIt")}</Link></div>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <fieldset className="radio-cards">
        <legend>{t("add.file.type")}</legend>
        {TYPES.map((k) => (
          <label key={k} className="radio-card"><input type="radio" name="type" value={k} checked={type === k} onChange={() => setType(k)} />{label(k)}</label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="af-title">{t("add.file.docTitle")}</label>
        <input id="af-title" value={title} placeholder={label(type)} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor="af-details">{t("add.file.details")}</label>
        <textarea id="af-details" rows={6} value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      {error && <p className="callout warn" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? t("share.working") : t("add.file.save")}</button>
    </form>
  );
}
