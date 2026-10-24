"use client";
/**
 * ISSUE WIZARD — an issuer creates, signs and sends one document in four steps, with a progress bar and Back.
 *
 *   1  Who is it for?     search holders by name or demo ID (only the MASKED ID is shown);
 *   2  What kind?         big cards, one per kind of document the issuer can create;
 *   3  Fill the details   a plain form (date pickers, big choice cards) with a live "paper" preview beside it;
 *   4  Review and sign    the paper again, one sentence of what will happen, and "Sign and issue".
 * When it is signed, a seal stamps onto the paper. The signing key stays on the server: this file only collects
 * answers and calls /api/issuer-portal/issue, which re-checks everything. A corrected copy (supersedes) skips step 2
 * because the kind is already known.
 */
import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { post } from "@/components/api";
import { useI18n } from "@/components/I18n";
import { useStepMotion } from "@/components/useStepMotion";
import { announce } from "@/components/Live";
import { Logo } from "@/components/Logo";
import { Stepper, StepTrail, UnderTheHood } from "@/components/Steps";
import { issueTrail, type IssueFacts } from "@/lib/trail";
import { checkForm, FORMS, type FieldProblem } from "@/lib/issue-forms";

interface Holder { ref: string; name: string; masked: string }
type Step = 1 | 2 | 3 | 4;
const STEPS = ["stepper.issue.1", "stepper.issue.2", "stepper.issue.3", "stepper.issue.4"];

export function IssueWizard({ issuerName, types, supersedes }: { issuerName: string; types: string[]; supersedes: { serial: string; docType: string } | null }) {
  const { t, fieldLabel, docTypeLabel } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Holder[] | null>(null);
  const [holder, setHolder] = useState<Holder | null>(null);
  const [docType, setDocType] = useState<string>(supersedes?.docType ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<Record<string, FieldProblem | string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<{ serial: string; trail?: IssueFacts } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const root = useRef<HTMLElement>(null);
  useStepMotion(root, step);

  // Look for holders as the person types (and list everyone at first).
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const r = await post<{ holders?: Holder[] }>("/api/issuer-portal/holder", { q });
      if (live) setFound(r.ok ? r.data.holders ?? [] : []);
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  // Move the screen reader to each new heading (not on first load).
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus(); }, [step, done]);

  const spec = docType ? FORMS[docType] : undefined;
  const typeLabel = docType ? docTypeLabel(docType) : "";
  const setAnswer = (k: string, v: string) => { setAnswers((a) => ({ ...a, [k]: v })); setProblems((p) => { const n = { ...p }; delete n[k]; return n; }); };

  const choose = (h: Holder) => {
    setHolder(h);
    setAnswers((a) => ({ name: h.name, ...a }));
    setStep(supersedes ? 3 : 2);
  };
  const pickType = (type: string) => {
    setDocType(type);
    setAnswers((a) => ({ name: holder?.name ?? a.name ?? "" }));
    setProblems({});
  };
  const review = () => {
    const c = checkForm(docType, answers);
    if (!c.ok) { setProblems(c.problems); setMessage(t("issuer.err.fix")); announce(t("issuer.err.fix")); return; }
    setMessage(null); setStep(4);
  };
  const sign = async () => {
    if (!holder) return;
    setBusy(true); setMessage(null);
    const r = await post<{ serial?: string; trail?: IssueFacts; error?: string; problems?: Record<string, string> }>("/api/issuer-portal/issue", {
      holder_ref: holder.ref, doc_type: docType, answers, supersedes: supersedes?.serial,
    });
    setBusy(false);
    if (r.offline) { setMessage(t("api.offline")); return; }
    if (!r.ok || !r.data.serial) {
      if (r.data.problems) { setProblems(r.data.problems); setStep(3); setMessage(t("issuer.err.fix")); announce(t("issuer.err.fix")); return; }
      setMessage(r.data.error ?? t("api.failed")); announce(t("api.failed")); return;
    }
    setDone({ serial: r.data.serial, trail: r.data.trail });
    announce(t("issuer.done.title"));
  };

  const progress = done ? 4 : step;
  const Paper = ({ serial }: { serial?: string }) => (
    <article className={`paper${serial ? " signed" : ""}`} aria-label={t("issuer.paper.title")}>
      <header><Logo size={30} /><strong>{issuerName}</strong><span className="chip unk">{t("banner.simulatedIssuer")}</span></header>
      <h3>{typeLabel || t("issuer.paper.title")}</h3>
      {holder && <p className="meta">{t("issuer.paper.for", { name: holder.name })}</p>}
      <dl>
        {(spec?.fields ?? []).map((f) => (
          <div key={f.key}><dt>{fieldLabel(f.key)}</dt><dd className={answers[f.key] ? undefined : "faint"}>{answers[f.key] || t("issuer.paper.empty")}</dd></div>
        ))}
      </dl>
      <footer>
        <span className="tabular">{serial ?? t("issuer.paper.serial")}</span>
        {serial && <span className="seal" aria-hidden="true"><BadgeCheck size={46} /></span>}
      </footer>
    </article>
  );

  if (done) {
    return (
      <section aria-labelledby="done-h" className="stack">
        <h2 id="done-h" ref={heading} tabIndex={-1}>{t("issuer.done.title")}</h2>
        <div className="issue-split">
          <Paper serial={done.serial} />
          <div className="card stack">
            <p className="lead">{t("issuer.done.body", { type: typeLabel, serial: done.serial, name: holder?.name ?? "" })}</p>
            {done.trail && <StepTrail steps={issueTrail(done.trail)} id="issue-trail-h" />}
            <UnderTheHood items={["salted", "ed25519", "sha256", "ledger"]} />
            <div className="row">
              <Link className="btn" href="/issuer/issued">{t("issuer.done.list")}</Link>
              <Link className="btn secondary" href="/issuer/issue" onClick={() => window.location.assign("/issuer/issue")}>{t("issuer.done.again")}</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const titleKey = `issuer.wiz.${step}.title`;
  return (
    <section aria-labelledby="wiz-h" className="stack" ref={root}>
      <Stepper steps={STEPS} current={progress} here={`stepper.issue.${progress}.here`} next={`stepper.issue.${progress}.next`} />
      <h2 id="wiz-h" ref={heading} tabIndex={-1}>{t(titleKey)}</h2>
      {supersedes && <p className="callout neutral" role="note">{t("issuer.wiz.correcting", { serial: supersedes.serial })}</p>}

      {step === 1 && (
        <div className="card stack">
          <div className="field">
            <label htmlFor="holder-q">{t("issuer.wiz.1.label")}</label>
            <input id="holder-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-describedby="holder-hint" />
            <span id="holder-hint" className="hint-text">{t("issuer.wiz.1.hint")}</span>
          </div>
          {found && found.length === 0 && <p className="callout neutral" role="status">{t("issuer.wiz.1.none")}</p>}
          <ul className="profile-cards">
            {(found ?? []).map((h) => (
              <li key={h.ref}>
                <button type="button" className="profile-card role-sender" onClick={() => choose(h)}>
                  <span className="avatar" aria-hidden="true">{h.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                  <span className="profile-text"><strong>{h.name}</strong><span className="tabular meta">{h.masked}</span><span className="use">{t("issuer.wiz.1.pick")}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 2 && (
        <div className="card stack">
          {holder && <p className="meta">{t("issuer.wiz.1.picked", { name: holder.name, id: holder.masked })}</p>}
          <fieldset className="radio-cards">
            <legend>{t("issuer.wiz.2.title")}</legend>
            {types.map((type) => (
              <label key={type} className="radio-card">
                <input type="radio" name="doctype" value={type} checked={docType === type} onChange={() => pickType(type)} />
                <span>{docTypeLabel(type)}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" disabled={!docType} onClick={() => setStep(3)}>{t("issuer.wiz.next")}</button>
        </div>
      )}

      {step === 3 && spec && (
        <div className="issue-split">
          <form className="card stack" noValidate onSubmit={(e) => { e.preventDefault(); review(); }}>
            <p className="note">{t("issuer.wiz.3.hint")}</p>
            {spec.fields.map((f) => {
              const err = problems[f.key];
              const id = `iss-${f.key}`;
              return (
                <div className="field" key={f.key}>
                  {f.kind === "choice" ? (
                    <fieldset className="radio-cards" aria-describedby={err ? `${id}-err` : undefined}>
                      <legend>{fieldLabel(f.key)}</legend>
                      {f.choices?.map((c) => (
                        <label key={c} className="radio-card"><input type="radio" name={id} value={c} checked={answers[f.key] === c} onChange={() => setAnswer(f.key, c)} /><span>{c}</span></label>
                      ))}
                    </fieldset>
                  ) : (
                    <>
                      <label htmlFor={id}>{fieldLabel(f.key)}</label>
                      <input id={id} type={f.kind === "date" ? "date" : "text"} inputMode={f.kind === "number" ? "decimal" : f.kind === "year" ? "numeric" : undefined}
                        value={answers[f.key] ?? ""} onChange={(e) => setAnswer(f.key, e.target.value)} autoComplete="off"
                        aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-err` : undefined} />
                    </>
                  )}
                  {err && <span id={`${id}-err`} className="field-error">{t(`issuer.err.${err}`)}</span>}
                </div>
              );
            })}
            {message && <p className="callout warn" role="alert">{message}</p>}
            <button type="submit">{t("issuer.wiz.review")}</button>
          </form>
          <Paper />
        </div>
      )}

      {step === 4 && (
        <div className="issue-split">
          <Paper />
          <div className="card stack">
            <p className="lead">{t("issuer.wiz.4.note", { name: holder?.name ?? "" })}</p>
            {message && <p className="callout warn" role="alert">{message}</p>}
            <button type="button" onClick={sign} disabled={busy}>{busy ? t("issuer.wiz.signing") : t("issuer.wiz.sign")}</button>
          </div>
        </div>
      )}

      <div className="row wizard-nav">
        {step === 1
          ? <Link className="btn text" href="/issuer">{t("ui.back")}</Link>
          : <button type="button" className="text" onClick={() => { setMessage(null); setStep((s) => (supersedes && s === 3 ? 1 : (s - 1) as Step)); }}>{t("ui.back")}</button>}
      </div>
    </section>
  );
}
