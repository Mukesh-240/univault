"use client";
/**
 * STEPS — the two pieces every main flow uses so people can SEE what the system does.
 *
 *   <Stepper>      "Step 2 of 4: Choose what to share": the steps as a numbered list (done ticked, current
 *                  highlighted, later ones grey), and two short lines under it: what happens here, what happens next.
 *                  A real <ol> with aria-current="step", so screen readers hear where they are.
 *   <StepTrail>    after an action: the internal steps that really ran (from src/lib/trail.ts, which builds them from
 *                  the real result), each with done / skipped / failed / waiting, its evidence (ledger line, time, id)
 *                  and a "Why we do this" line that opens on tap.
 *   <UnderTheHood> a small closed disclosure with the technical names (SHA-256, Ed25519, …) and their plain meaning.
 * All words come from the locale files (English and Telugu).
 */
import { Check, CircleDashed, CircleMinus, CircleX, Clock } from "lucide-react";
import Link from "next/link";
import type { StepStatus, TrailStep } from "@/lib/trail";
import { useI18n } from "./I18n";

export function Stepper({ steps, current, here, next }: { steps: string[]; current: number; here: string; next?: string }) {
  const { t } = useI18n();
  return (
    <div className="stepper">
      <p className="stepper-title"><strong>{t("stepper.of", { n: current, total: steps.length })}</strong> {t(steps[current - 1])}</p>
      <ol className="stepper-list">
        {steps.map((s, i) => {
          const n = i + 1;
          const state = n < current ? "done" : n === current ? "now" : "later";
          return (
            <li key={s} className={`stepper-item ${state}`} aria-current={state === "now" ? "step" : undefined}>
              <span className="stepper-dot" aria-hidden="true">{state === "done" ? <Check size={14} /> : n}</span>
              <span className="stepper-label">{t(s)}</span>
              {state === "done" && <span className="sr-only">{t("stepper.done")}</span>}
            </li>
          );
        })}
      </ol>
      <dl className="stepper-what">
        <div><dt>{t("stepper.here")}</dt><dd>{t(here)}</dd></div>
        {next && <div><dt>{t("stepper.next")}</dt><dd>{t(next)}</dd></div>}
      </dl>
    </div>
  );
}

const ICON: Record<StepStatus, typeof Check> = { done: Check, skipped: CircleMinus, failed: CircleX, waiting: Clock };

export function StepTrail({ steps, title = "trail.title", id }: { steps: TrailStep[]; title?: string; id?: string }) {
  const { t, fieldLabel } = useI18n();
  // Field NAMES (never values) may appear in a step; show them in the person's language.
  const vars = (v: TrailStep["vars"]) => v && Object.fromEntries(Object.entries(v).map(([k, x]) =>
    [k, k === "fields" ? String(x).split(", ").map((f) => fieldLabel(f)).join(", ") : k === "field" ? fieldLabel(String(x)) : x]));
  return (
    <section className="trail" aria-labelledby={id ?? "trail-h"} data-trail-steps={steps.length}>
      <h3 id={id ?? "trail-h"} className="trail-title"><CircleDashed size={18} aria-hidden="true" /> {t(title)}</h3>
      <ol className="trail-list">
        {steps.map((s, i) => {
          const Icon = ICON[s.status];
          return (
            <li key={`${s.text}-${i}`} className={`trail-step ${s.status}`}>
              <span className="trail-icon" aria-hidden="true"><Icon size={16} /></span>
              <div className="trail-body">
                <p className="trail-text"><span className="sr-only">{t(`trail.status.${s.status}`)}: </span>{t(s.text, vars(s.vars))}
                  {s.evidence && (
                    <span className="trail-evidence"> · {s.evidence.href
                      ? <Link href={s.evidence.href}>{t(`trail.evidence.${s.evidence.kind}`, { value: s.evidence.value })}</Link>
                      : <span className="mono">{t(`trail.evidence.${s.evidence.kind}`, { value: s.evidence.value })}</span>}</span>
                  )}
                </p>
                <details className="trail-why"><summary>{t("trail.why")}</summary><p>{t(s.why)}</p></details>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function UnderTheHood({ items }: { items: string[] }) {
  const { t } = useI18n();
  return (
    <details className="under-hood">
      <summary>{t("hood.title")}</summary>
      <dl>
        {items.map((k) => <div key={k}><dt>{t(`hood.${k}.term`)}</dt><dd>{t(`hood.${k}.plain`)}</dd></div>)}
      </dl>
    </details>
  );
}
