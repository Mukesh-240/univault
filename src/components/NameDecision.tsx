"use client";
/**
 * NAME DECISION — the person's explicit answer for one candidate name match.
 * UNIVAULT never merges by itself: only these buttons create a link, through POST /api/names, which
 * stores a new append-only decision row plus a ledger line. A later click adds another decision.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./api";
import { useI18n } from "./I18n";
import { announce } from "./Live";

export function NameDecision({ a, b, decision, label }: { a: string; b: string; decision?: string; label: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const decide = async (d: "confirmed_same_person" | "rejected") => {
    setBusy(true);
    const r = await post("/api/names", { doc_a: a, doc_b: b, decision: d });
    setBusy(false);
    const msg = r.offline ? t("api.offline") : r.ok ? t(d === "rejected" ? "names.rejectedMsg" : "names.confirmedMsg", { pair: label }) : t("api.failed");
    announce(msg);
    if (r.ok) router.refresh();
  };

  return (
    <div className="decision" role="group" aria-label={t("names.decisionFor", { pair: label })}>
      {decision && <p className="decision-current">{t(`names.decision.${decision}`)}</p>}
      <button type="button" disabled={busy} onClick={() => decide("confirmed_same_person")}>{t("names.confirm")}</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => decide("rejected")}>{t("names.reject")}</button>
    </div>
  );
}
