/**
 * ONE DOCUMENT — what it says, whether the issuer confirmed it, and what has happened to it.
 *
 * Plain-English picture:
 *   Left: a "paper" showing what the document says (for a photo, the photo too).
 *   Right: "Checked with the issuer" (status chip, time, the Check again button) and "History of changes"
 *   (when it was added, every issuer check, every correction you made), newest first.
 *   Buttons: "Share a part of this" and "Check again".
 *   Below: for a photo, the big-box review ("This is correct" / "Let me fix it"); a note if the text
 *   looks like instructions (it is ignored); "For experts" (tamper-proof seal, signature, serial number,
 *   the original values that can never change, the confidence/source details); and "Remove this document".
 * Everything here is read from the database; nothing on this page decides anything.
 */
import Link from "next/link";
import { EraseDocument } from "@/components/EraseDocument";
import { explain } from "@/lib/explain";
import { Explain } from "@/components/Explain";
import { FieldReview } from "@/components/FieldReview";
import { TierBadge } from "@/components/Badges";
import { DocIcon } from "@/components/DocIcon";
import { StatusChip } from "@/components/StatusChip";
import { VerifyPanel } from "@/components/VerifyPanel";
import { fieldLabel, hasTelugu, showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { injectionExplanation, scanDocument } from "@/lib/injection";
import { reviewHints } from "@/lib/ocr";
import { loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { agoKey, agoParts, docStatus, statusOfDoc } from "@/lib/ui-logic";
import { tierOf } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VERIFICATION_STATES = ["verified", "unverifiable", "tamper_flagged", "superseded", "revoked"];
const MAX_HISTORY = 10;

interface Row { at: string; kind: "added" | "checked" | "confirmed" | "corrected"; text: string }

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { lang, t } = await getI18n();
  const { id } = await params;
  const ctx = await loadDemoVault();
  const doc = ctx.docs.find((d) => d.id === id);
  if (!doc) {
    return (
      <div className="card stack-s">
        <h1>{t("doc.notFound")}</h1>
        <div className="card-actions"><Link href="/" className="btn">{t("doc.backHome")}</Link></div>
      </div>
    );
  }

  // History: when it was added, every check with the issuer, every confirmation or correction.
  const [row, events, assertions] = await Promise.all([
    supabase.from("documents").select("created_at, sha256, synthetic_origin").eq("id", id).single(),
    supabase.from("document_events").select("state, created_at").eq("document_id", id).order("created_at", { ascending: false }).limit(60),
    supabase.from("assertions").select("field, asserted_value, created_at").eq("document_id", id).order("created_at", { ascending: false }).limit(60),
  ]);
  const meta = (row.data ?? {}) as { created_at?: string; sha256?: string; synthetic_origin?: { dataset?: string; ref?: string } | null };
  const asserted = ctx.confirmedFields[doc.id] ?? {};
  const history: Row[] = [
    ...((events.data ?? []) as { state: string; created_at: string }[]).filter((e) => VERIFICATION_STATES.includes(e.state))
      .map((e): Row => ({ at: e.created_at, kind: "checked", text: t("doc.history.checked", { status: t(`status.${docStatus(e.state)}`) }) })),
    ...((assertions.data ?? []) as { field: string; asserted_value: string; created_at: string }[])
      .map((a): Row => a.asserted_value === doc.fields[a.field]
        ? { at: a.created_at, kind: "confirmed", text: t("doc.history.confirmed", { field: fieldLabel(lang, a.field) }) }
        : { at: a.created_at, kind: "corrected", text: t("doc.history.corrected", { field: fieldLabel(lang, a.field) }) }),
  ].sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, MAX_HISTORY);
  if (meta.created_at) history.push({ at: meta.created_at, kind: "added", text: t("doc.history.added") });

  const v = ctx.verification[doc.id];
  const now = new Date();
  const ago = agoKey(agoParts(v?.checkedAt, now));
  const scan = doc.capture === "scan";
  const scanFile = meta.synthetic_origin?.dataset === "scans" ? meta.synthetic_origin.ref : undefined;
  const hints = new Map(reviewHints(doc).map((h) => [h.field, h.why]));
  const injection = scanDocument(doc);
  const sig = v?.signatureValid === undefined ? t("doc.expert.sigNone") : v.signatureValid ? t("doc.expert.sigOk") : t("doc.expert.sigBad");

  return (
    <>
      <p><Link href="/" className="btn text">← {t("doc.backHome")}</Link></p>
      <div className="page-head">
        <div className="icon-title"><DocIcon type={doc.doc_type} size={40} /><h1 lang={hasTelugu(doc.title) ? "te" : undefined}>{doc.title}</h1></div>
        <p className="meta">{doc.issuer ?? t("vault.noIssuer")}</p>
      </div>

      <div className="doc-layout">
        <section className="doc-preview" aria-labelledby="says-h">
          <h2 id="says-h">{t("doc.says")}</h2>
          {scanFile && <img src={`/${scanFile}`} alt={t("doc.photoAlt")} width={900} height={520} style={{ width: "100%", height: "auto", marginBottom: "var(--s2)", border: "2px solid var(--edge)", borderRadius: 10 }} />}
          <dl>
            {Object.entries(doc.fields).map(([k, val]) => (
              <div key={k}>
                <dt>{fieldLabel(lang, k)}</dt>
                <dd lang={hasTelugu(val) ? "te" : undefined}>{asserted[k] ?? val}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="stack">
          <section className="card" aria-labelledby="chk-h">
            <div className="card-head"><h2 id="chk-h">{t("doc.checkedTitle")}</h2><StatusChip status={statusOfDoc(doc, ctx)} t={t} /></div>
            <p className="meta">{v ? t("doc.checkedAt", { when: t(ago.key, { n: ago.n ?? 0 }) }) : t(doc.serial ? "doc.notChecked" : "doc.noSerial")}</p>
            {doc.serial && <VerifyPanel docId={doc.id} title={doc.title} initial={v} />}
          </section>

          <section className="card" aria-labelledby="hist-h">
            <h2 id="hist-h">{t("doc.historyTitle")}</h2>
            <ol className="timeline">
              {history.map((h, i) => <li key={i}><span className="meta">{showTime(h.at)}</span><br />{h.text}</li>)}
            </ol>
          </section>
        </div>
      </div>

      <div className="row"><Link href={`/share?from=${doc.doc_type}`} className="btn">{t("doc.share")}</Link></div>

      {scan && (
        <section className="stack-s" aria-labelledby="scan-h" style={{ marginTop: "var(--s3)" }}>
          <h2 id="scan-h">{t("doc.scanTitle")}</h2>
          <p className="note">{t("doc.scanNote")}</p>
          <FieldReview docId={doc.id} idPrefix={`f-${doc.id}`} fields={Object.entries(doc.fields).map(([name, original]) => ({
            name, original, asserted: asserted[name], confidence: doc.ocr_confidence?.[name], hints: hints.get(name) ?? [] }))} />
        </section>
      )}

      {injection.suspected && (
        <div className="callout neutral" role="note">
          <p><strong>{t("vault.injectionTitle")}</strong> {t("vault.injectionNote")}</p>
          <Explain kind="injection_flag" targetId={doc.id} docs={{ [doc.id]: doc.title }} explanation={explain({
            reason: `The text ${injection.hits.join("; ")}. It is treated as data and nothing in it can create or change a share.`,
            confidence: { kind: "evidence", value: "weaker" },
            source: { name: "UNIVAULT instruction-text detector (fixed patterns)", version: 1, checkedAt: now.toISOString(), freshness: "fresh" },
            documentIds: [doc.id],
          })} />
        </div>
      )}

      <details className="expert">
        <summary>{t("ui.experts")}</summary>
        <dl className="receipt">
          <div><dt>{t("doc.expert.seal")}</dt><dd><code>{doc.sha256 ?? meta.sha256 ?? "—"}</code></dd></div>
          <div><dt>{t("doc.expert.signature")}</dt><dd>{sig}</dd></div>
          <div><dt>{t("doc.expert.serial")}</dt><dd>{doc.serial ?? "—"}</dd></div>
          <div><dt>{t("doc.expert.tier")}</dt><dd><TierBadge tier={tierOf(doc, ctx)} t={t} /></dd></div>
          <div><dt>{t("doc.expert.capture")}</dt><dd>{t(`capture.${doc.capture}`)}</dd></div>
        </dl>
        <h3>{t("vault.originalValues")}</h3>
        <p className="note">{t("vault.lock")}</p>
        <table className="fields">
          <tbody>
            {Object.entries(doc.fields).map(([k, val]) => (
              <tr key={k}>
                <th scope="row">{fieldLabel(lang, k)}</th>
                <td><span className="original" lang={hasTelugu(val) ? "te" : undefined}>{val}</span>
                  {asserted[k] !== undefined && asserted[k] !== val && <span className="layer">{t("vault.yourLayer")}: {asserted[k]}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {injection.suspected && <Explain explanation={injectionExplanation(injection, doc.id)} kind="injection_flag" targetId={doc.id} />}
        {v && <Explain explanation={{ ...v.explanation, reason: v.reason }} kind="verification" targetId={doc.id} />}
      </details>

      <section className="stack-s" aria-labelledby="rm-h" style={{ marginTop: "var(--s3)" }}>
        <h2 id="rm-h" className="h3">{t("doc.removeTitle")}</h2>
        <EraseDocument docId={doc.id} title={doc.title} />
      </section>
    </>
  );
}
