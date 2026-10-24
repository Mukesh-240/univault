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
import { StepTrail } from "./Steps";
import { namesTrail } from "@/lib/trail";

export function NameDecision({ a, b, decision, label }: { a: string; b: string; decision?: string; label: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ decision: "confirmed_same_person" | "rejected"; score: number } | null>(null);

  const decide = async (d: "confirmed_same_person" | "rejected") => {
    setBusy(true);
    const r = await post<{ score?: number }>("/api/names", { doc_a: a, doc_b: b, decision: d });
    setBusy(false);
    const msg = r.offline ? t("api.offline") : r.ok ? t(d === "rejected" ? "names.rejectedMsg" : "names.confirmedMsg", { pair: label }) : t("api.failed");
    announce(msg);
    if (r.ok) { setDone({ decision: d, score: r.data.score ?? 0 }); router.refresh(); }
  };

  return (
    <div className="decision" role="group" aria-label={t("names.decisionFor", { pair: label })}>
      {decision && <p className="decision-current">{t(`names.decision.${decision}`)}</p>}
      <button type="button" disabled={busy} onClick={() => decide("confirmed_same_person")}>{t("names.confirm")}</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => decide("rejected")}>{t("names.reject")}</button>
      {/* "Not sure" records nothing: no decision is made until the person is ready. */}
      <button type="button" className="text" onClick={() => announce(t("names.notSureMsg"))}>{t("names.notSure")}</button>
      {done && <StepTrail steps={namesTrail(done)} id={`names-trail-${a}-${b}`} />}
    </div>
  );
}
