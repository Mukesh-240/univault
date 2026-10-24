"use client";
/**
 * ASSISTANT PANEL — asks POST /api/assistant for proposal cards and shows them.
 * Every card is a SUGGESTION with a link to where the person can act; there is no button that
 * performs anything. Before and after asking, it reads the ledger length and the number of shares,
 * so anyone can see the assistant wrote nothing (even when a document contains hidden instructions).
 */
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { Reason } from "@/components/Reason";
import { get, post } from "@/components/api";
import type { AssistantReply, CardKind } from "@/lib/assistant";

interface PackInfo { id: string; title: string; labels: Record<string, { en: string; local: string }> }
interface Counts { ledger: number; shares: number }

/** Where each kind of proposal can be acted on (the person does it there, themselves). */
const WHERE: Record<CardKind, string> = {
  add_document: "/", verify_document: "/verify", contact_issuer: "/verify", renew_document: "/readiness",
  confirm_scan: "/", confirm_name_link: "/names", review_names: "/names", not_eligible: "/readiness", prepare_share_draft: "/readiness",
};

export function AssistantPanel({ packs }: { packs: PackInfo[] }) {
  const { lang, t } = useI18n();
  const [purpose, setPurpose] = useState(packs[0]?.id ?? "");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [counts, setCounts] = useState<{ before: Counts; after: Counts } | null>(null);
  const [busy, setBusy] = useState(false);

  const snapshot = async (): Promise<Counts | null> => {
    const r = await get<{ counts: { ledger: number; shares: number } }>("/api/faults");
    return r.ok ? { ledger: r.data.counts.ledger, shares: r.data.counts.shares } : null;
  };

  const ask = async () => {
    setBusy(true);
    const before = await snapshot();
    const r = await post<AssistantReply>("/api/assistant", { purpose });
    const after = await snapshot();
    setBusy(false);
    if (r.offline) { announce(t("api.offline")); return; }
    if (!r.ok) { announce(t("api.failed")); return; }
    setReply(r.data);
    if (before && after) setCounts({ before, after });
    announce(t("assistant.done", { n: r.data.cards.length }));
  };

  const pack = packs.find((p) => p.id === purpose);
  /** The card reason is "<rule label>: <reason>"; show the label in the chosen language and translate the rest. */
  const cardReason = (ruleId: string | null, reason: string) => {
    const label = ruleId ? pack?.labels[ruleId] : undefined;
    if (!label || !reason.startsWith(`${label.en}: `)) return <Reason text={reason} lang={lang} />;
    return <><strong>{label.local}:</strong> <Reason text={reason.slice(label.en.length + 2)} lang={lang} /></>;
  };

  return (
    <>
      <div className="panel row">
        <label htmlFor="purpose">{t("assistant.purpose")}</label>
        <select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <button type="button" onClick={ask} disabled={busy}>{t("assistant.ask", { purpose: pack?.title ?? "" })}</button>
      </div>

      {reply && (
        <section aria-labelledby="cards-h">
          <h2 id="cards-h">{t("assistant.cardsTitle")} · {t(`overall.${reply.overall}`)}</h2>
          <ul className="cardlist">
            {reply.cards.map((c, i) => (
              <li key={i} className="proposal">
                <h3>{t(`card.${c.kind}`)}</h3>
                <p>{cardReason(c.ruleId, c.reason)}</p>
                <p className="meta">{t("assistant.proposalOnly")} · <Link href={WHERE[c.kind]}>{t("assistant.goAct")}</Link></p>
              </li>
            ))}
          </ul>
          {reply.warnings.length > 0 && (
            <div className="callout neutral">
              <h3>{t("assistant.warningsTitle")}</h3>
              <ul>
                {reply.warnings.map((w) => (
                  <li key={w.documentId}><Reason text={w.reasons.join("; ")} lang={lang} />. <Reason text={w.note} lang={lang} /> <Link href={`/#doc-${w.documentId}`}>{t("assistant.seeDoc")}</Link></li>
                ))}
              </ul>
            </div>
          )}
          {counts && (
            <p className="callout ok">{t("assistant.counts", { lb: counts.before.ledger, la: counts.after.ledger, sb: counts.before.shares, sa: counts.after.shares })}</p>
          )}
          <p className="note"><Reason text={reply.disclaimer} lang={lang} /></p>
        </section>
      )}
    </>
  );
}
