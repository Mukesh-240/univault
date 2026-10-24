/**
 * OCR — read the generated scanned marksheets, review what was read, and measure how good it was.
 *
 * Top part (interactive, components in OcrWorkbench.tsx):
 *   each scan image side by side with the fields read from it and a confidence per field. The reading
 *   comes from Tesseract.js (English + Telugu): either the SAVED results (public/ocr/fixtures.json,
 *   produced by running Tesseract once — works offline) or a LIVE run in this browser.
 *   "Add to vault" stores the reading through the normal upload front door; every field then stays
 *   "unconfirmed" until the person confirms or corrects it (a correction is a separate assertion row).
 *
 * Bottom part (evaluation, read-only): field-level accuracy BEFORE and AFTER corrections, and a
 * confidence-calibration table, compared against the ground-truth label file. This is the only page
 * that reads a label file, and only to grade results — never to make a decision.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calibration, compare, groundTruth } from "../../../eval/ocr-accuracy";
import { getI18n } from "@/lib/i18n-server";
import { extractFields, type OcrLine } from "@/lib/ocr-extract";
import { reviewHints } from "@/lib/ocr";
import { DEMO_OWNER, loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { OcrWorkbench, type ScanItem } from "./OcrWorkbench";

export const dynamic = "force-dynamic";

interface Fixtures { engine: string; languages: string[]; created: string; scans: { file: string; lines: OcrLine[] }[] }

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export default async function OcrPage() {
  const { t } = await getI18n();
  const fixtures = JSON.parse(readFileSync(join(process.cwd(), "public", "ocr", "fixtures.json"), "utf8")) as Fixtures;
  const truth = groundTruth();
  const ctx = await loadDemoVault();

  // Which vault documents came from which scan image (by the origin label written at upload).
  const rows = await supabase.from("documents").select("id, synthetic_origin").eq("owner", DEMO_OWNER);
  const docForFile = new Map<string, string>();
  for (const r of rows.data ?? []) {
    const ref = (r.synthetic_origin as { dataset?: string; ref?: string } | null);
    if (ref?.dataset === "scans" && ref.ref && ctx.docs.some((d) => d.id === r.id)) docForFile.set(ref.ref, r.id as string);
  }

  const items: ScanItem[] = fixtures.scans.map((s) => {
    const doc = ctx.docs.find((d) => d.id === docForFile.get(s.file));
    const asserted = doc ? ctx.confirmedFields[doc.id] ?? {} : {};
    const hints = doc ? new Map(reviewHints(doc).map((h) => [h.field, h.why])) : new Map<string, string[]>();
    return {
      file: s.file, damage: truth.get(s.file)?.damage ?? "", lines: s.lines,
      stored: doc ? { id: doc.id, fields: Object.entries(doc.fields).map(([name, original]) => ({
        name, original, asserted: asserted[name], confidence: doc.ocr_confidence?.[name], hints: hints.get(name) ?? [] })) } : null,
    };
  });

  // Evaluation: before = OCR reading (stored original, or the saved reading if not stored yet); after = with the person's layer.
  const evalRows = items.map((it) => {
    const tr = truth.get(it.file)?.fields ?? {};
    const doc = it.stored ? ctx.docs.find((d) => d.id === it.stored!.id) : undefined;
    const read = doc ? doc.fields : Object.fromEntries(Object.entries(extractFields(it.lines)).map(([k, v]) => [k, v.value]));
    const after = doc ? { ...doc.fields, ...(ctx.confirmedFields[doc.id] ?? {}) } : null;
    return { file: it.file, damage: it.damage, before: compare(read, tr), after: after ? compare(after, tr) : null };
  });
  const sum = (k: "before" | "after") => evalRows.reduce((a, r) => { const c = r[k] ?? r.before; return { correct: a.correct + c.correct, total: a.total + c.total }; }, { correct: 0, total: 0 });
  const before = sum("before"), after = sum("after");
  const calib = calibration(fixtures.scans.flatMap((s) => {
    const tr = truth.get(s.file)?.fields ?? {};
    return Object.entries(extractFields(s.lines)).filter(([k]) => k in tr).map(([k, v]) => ({ confidence: v.confidence, correct: v.value.trim() === tr[k].trim() }));
  }));

  return (
    <>
      <h1>{t("ocr.title")}</h1>
      <p className="lead">{t("ocr.intro")}</p>
      <p className="note">{t("ocr.unconfirmed")}</p>
      <OcrWorkbench items={items} engine={fixtures.engine} created={fixtures.created} />

      <section className="panel" aria-labelledby="ocr-eval-h">
        <h2 id="ocr-eval-h">{t("ocr.evalTitle")}</h2>
        <p className="note">{t("ocr.evalNote")}</p>
        <table>
          <caption>{t("ocr.accuracyCaption")}</caption>
          <thead><tr><th scope="col">{t("ocr.scan")}</th><th scope="col">{t("ocr.damage")}</th><th scope="col">{t("ocr.before")}</th><th scope="col">{t("ocr.after")}</th></tr></thead>
          <tbody>
            {evalRows.map((r) => (
              <tr key={r.file}>
                <th scope="row">{r.file.replace("scans/", "")}</th>
                <td>{r.damage}</td>
                <td>{r.before.correct}/{r.before.total} ({pct(r.before.correct, r.before.total)})</td>
                <td>{r.after ? `${r.after.correct}/${r.after.total} (${pct(r.after.correct, r.after.total)})` : t("ocr.notStored")}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">{t("ocr.total")}</th><td></td>
              <td><strong>{before.correct}/{before.total} ({pct(before.correct, before.total)})</strong></td>
              <td><strong>{after.correct}/{after.total} ({pct(after.correct, after.total)})</strong></td>
            </tr>
          </tbody>
        </table>
        <table>
          <caption>{t("ocr.calibCaption")}</caption>
          <thead><tr><th scope="col">{t("ocr.band")}</th><th scope="col">{t("ocr.fields")}</th><th scope="col">{t("ocr.meanConf")}</th><th scope="col">{t("ocr.actual")}</th></tr></thead>
          <tbody>
            {calib.map((b) => (
              <tr key={b.lo}>
                <th scope="row">{b.lo.toFixed(2)}–{b.hi.toFixed(2)}</th>
                <td>{b.fields}</td>
                <td>{b.meanConfidence === null ? "—" : b.meanConfidence.toFixed(2)}</td>
                <td>{b.accuracy === null ? "—" : `${b.right}/${b.fields} (${pct(b.right, b.fields)})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">{t("ocr.calibNote")}</p>
      </section>
    </>
  );
}
