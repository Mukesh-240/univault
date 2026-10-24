"use client";
/**
 * <Explain> — the ONE component attached to every automated result (master rule 5, spec F23).
 *
 * It always shows the four things an engine must tell the person:
 *   1. the REASON (in English or Telugu),  2. the CONFIDENCE (score / pass-fail-unknown / evidence),
 *   3. the SOURCE (rule pack, issuer registry version, ...), 4. its FRESHNESS (when it was checked);
 * and the two actions: "Correct / Override" and "Escalate / Dispute". Pressing either records an
 * append-only ledger line through POST /api/feedback (it never edits anything) and announces it.
 * This component makes no decisions: it only displays what the engine produced.
 */
import { useState } from "react";
import type { Explanation } from "@/lib/explain";
import { showTime } from "@/lib/i18n-core";
import { post } from "./api";
import { useI18n } from "./I18n";
import { announce } from "./Live";
import { Reason } from "./Reason";

export type TargetKind = "readiness_rule" | "name_match" | "ocr_field" | "verification" | "injection_flag" | "over_broad" | "duplicate";

interface Props {
  explanation: Explanation;
  kind: TargetKind;
  targetId: string;
  /** Titles of documents, so the documents an answer used can be linked by name. */
  docs?: Record<string, string>;
  /** Hide the reason line when the surrounding card already shows it. */
  hideReason?: boolean;
}

/** The feedback route accepts target ids up to 120 characters. */
const MAX_TARGET = 120;

export function Explain({ explanation, kind, targetId, docs, hideReason }: Props) {
  const { lang, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const act = async (action: "override" | "dispute") => {
    setBusy(true);
    const r = await post("/api/feedback", { target_kind: kind, target_id: targetId.slice(0, MAX_TARGET), action });
    setBusy(false);
    const msg = r.offline ? t("api.offline") : r.ok ? t(`explain.${action}Done`) : t("api.failed");
    setDone(msg);
    announce(msg);
  };

  const c = explanation.confidence;
  const confidence = c.kind === "score" ? t("conf.score", { value: c.value.toFixed(2) })
    : c.kind === "tri" ? t(`tri.${c.value}`) : t(`conf.evidence.${c.value}`);
  const s = explanation.source;

  return (
    <div className="explain">
      {!hideReason && <p className="explain-reason"><Reason text={explanation.reason} lang={lang} /></p>}
      <dl className="explain-meta">
        <div><dt>{t("explain.confidence")}</dt><dd>{confidence}</dd></div>
        <div><dt>{t("explain.source")}</dt><dd><span lang="en">{s.name}</span>{s.version !== undefined ? ` · ${t("explain.version", { v: String(s.version) })}` : ""}</dd></div>
        <div><dt>{t("explain.freshness")}</dt><dd>{s.checkedAt ? `${t("explain.checkedAt", { time: showTime(s.checkedAt) })} · ` : ""}{t(`fresh.${s.freshness ?? "n/a"}`)}</dd></div>
        {docs && explanation.documentIds.length > 0 && (
          <div><dt>{t("explain.documents")}</dt><dd>{explanation.documentIds.map((id, i) => (
            <span key={id}>{i ? ", " : ""}<a href={`/doc/${id}`}>{docs[id] ?? t("explain.unknownDoc")}</a></span>))}</dd></div>
        )}
      </dl>
      <div className="explain-actions">
        <button type="button" className="btn-small" disabled={busy} onClick={() => act("override")}>{t("explain.override")}</button>
        <button type="button" className="btn-small secondary" disabled={busy} onClick={() => act("dispute")}>{t("explain.dispute")}</button>
        {done && <span className="explain-done">{done}</span>}
      </div>
    </div>
  );
}
