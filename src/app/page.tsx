/**
 * THE VAULT — every document the person holds, as cards.
 *
 * Each card shows: the trust tier (issuer-verified solid / user-uploaded outlined / user-corrected
 * dashed, each with words), the verification state and freshness, the ORIGINAL values (immutable —
 * shown with a lock note), any separate correction layered on top, warnings about instructions hidden
 * in the document, and where synthetic demo data came from. Scans get the confirm/correct table.
 * Every automated result is shown through <Explain>. This page only DISPLAYS engine results.
 */
import Link from "next/link";
import { StateBadge, TierBadge } from "@/components/Badges";
import { Explain } from "@/components/Explain";
import { FieldReview } from "@/components/FieldReview";
import { LedgerCheck } from "@/components/LedgerCheck";
import { dobConsistency, dobExplanation, findDuplicates } from "@/lib/duplicates";
import { fieldLabel, hasTelugu, type Lang } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { injectionExplanation, scanDocument } from "@/lib/injection";
import { verify } from "@/lib/ledger";
import { reviewHints } from "@/lib/ocr";
import { DEMO_OWNER, loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { tierOf, type EngineContext, type VaultDoc } from "@/lib/vault";

export const dynamic = "force-dynamic";

type Origin = { recipe?: string; seed?: number; dataset?: string } | null;

export default async function VaultPage() {
  const { lang, t } = await getI18n();
  const ctx = await loadDemoVault();
  // Labels only (never used for decisions): which documents are synthetic, and where they came from.
  const labels = await supabase.from("documents").select("id, synthetic, synthetic_origin").eq("owner", DEMO_OWNER);
  const origin = new Map((labels.data ?? []).map((r) => [r.id as string, { synthetic: Boolean(r.synthetic), origin: r.synthetic_origin as Origin }]));
  const ledger = await verify(supabase);
  const titles = Object.fromEntries(ctx.docs.map((d) => [d.id, d.title]));
  const dups = findDuplicates(ctx.docs);
  const dob = dobConsistency(ctx.docs);

  return (
    <>
      <h1>{t("vault.title")}</h1>
      <p className="lead">{t("vault.intro", { n: ctx.docs.length })}</p>
      <p className="note">{t("vault.immutable")}</p>

      <section className="panel" aria-labelledby="ledger-h">
        <h2 id="ledger-h">{t("ledger.title")}</h2>
        <p>{ledger.ok ? t("ledger.ok", { n: ledger.total }) : t("ledger.broken", { line: String(ledger.broken_at) })}</p>
        <LedgerCheck />
      </section>

      <section aria-labelledby="checks-h" className="panel">
        <h2 id="checks-h">{t("vault.checks")}</h2>
        <h3>{t("vault.dob")}</h3>
        <Explain explanation={dobExplanation(dob)} kind="duplicate" targetId="dob-consistency" docs={titles} />
        <h3>{t("vault.duplicates")}</h3>
        {dups.length === 0 ? <p>{t("vault.noDuplicates")}</p> : (
          <ul className="rules">
            {dups.map((p) => (
              <li key={`${p.a}|${p.b}`}>
                <p className="rule-head"><strong>{t(`dup.${p.kind}`)}</strong></p>
                <Explain explanation={{ ...p.explanation, documentIds: [p.a, p.b] }} kind="duplicate" targetId={`${p.a}|${p.b}`} docs={titles} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2>{t("vault.documents")}</h2>
      <ul className="cards">
        {ctx.docs.map((d) => (
          <li key={d.id} id={`doc-${d.id}`} className="card">
            <DocCard doc={d} ctx={ctx} lang={lang} t={t} label={origin.get(d.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function DocCard({ doc, ctx, lang, t, label }: { doc: VaultDoc; ctx: EngineContext; lang: Lang; t: (k: string, v?: Record<string, string | number>) => string; label?: { synthetic: boolean; origin: Origin } }) {
  const v = ctx.verification[doc.id];
  const asserted = ctx.confirmedFields[doc.id] ?? {};
  const scan = scanDocument(doc);
  const hints = new Map(reviewHints(doc).map((h) => [h.field, h.why]));
  const headingId = `doc-h-${doc.id}`;
  return (
    <article aria-labelledby={headingId}>
      <div className="card-head">
        <h3 id={headingId}>{doc.title}</h3>
        <p className="meta">
          <TierBadge tier={tierOf(doc, ctx)} t={t} />
          {v ? <StateBadge state={v.state} t={t} /> : <StateBadge state="not_checked" t={t} />}
          {v?.freshness === "stale" && <span className="badge state-stale">{t("verify.staleBadge")}</span>}
        </p>
      </div>
      <p className="meta">
        {t(`capture.${doc.capture}`)} · {doc.issuer ?? t("vault.noIssuer")}{doc.serial ? ` · ${t("vault.serial")}: ${doc.serial}` : ""}
        {label?.synthetic && <> · {t("vault.synthetic")}{label.origin?.recipe ? ` (${t("vault.origin", { recipe: label.origin.recipe, seed: label.origin.seed ?? "?", dataset: label.origin.dataset ?? "?" })})` : ""}</>}
      </p>

      {doc.capture === "scan" ? (
        <FieldReview docId={doc.id} idPrefix={`f-${doc.id}`} fields={Object.entries(doc.fields).map(([name, original]) => ({
          name, original, asserted: asserted[name], confidence: doc.ocr_confidence?.[name], hints: hints.get(name) ?? [] }))} />
      ) : (
        <table className="fields">
          <caption>{t("vault.originalValues")} <span className="lock">— {t("vault.lock")}</span></caption>
          <tbody>
            {Object.entries(doc.fields).map(([k, val]) => (
              <tr key={k}>
                <th scope="row">{fieldLabel(lang, k)}</th>
                <td>
                  <span className="original" lang={hasTelugu(val) ? "te" : undefined}>{val}</span>
                  {asserted[k] !== undefined && asserted[k] !== val && <span className="layer">{t("vault.yourLayer")}: {asserted[k]}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {scan.suspected && (
        <div className="callout neutral">
          <p><strong>{t("vault.injectionTitle")}</strong> {t("vault.injectionNote")}</p>
          <Explain explanation={injectionExplanation(scan, doc.id)} kind="injection_flag" targetId={doc.id} />
        </div>
      )}

      <h4 className="sr-only">{t("vault.verification")}</h4>
      {v ? (
        <Explain explanation={{ ...v.explanation, reason: v.reason }} kind="verification" targetId={doc.id} />
      ) : (
        <p className="note">{t("vault.notChecked")} {doc.serial && <Link href={`/verify#v-${doc.id}`}>{t("vault.verifyLink")}</Link>}</p>
      )}
    </article>
  );
}
