"use client";
/**
 * SIGN-IN FLOW — three big steps, one main task each, with a progress bar and a Back button.
 *
 *   Step 1  "Enter your demo Aadhaar number": prefilled with a valid demo number; "Use a demo number"
 *           fills another; digits are spaced in fours while typing; the number pad opens on phones; the
 *           check says in plain words what is wrong (a number that does not start with 0000 is refused).
 *   Step 2  "Enter the code": the SIMULATED code is shown on screen (no SMS is sent), six big boxes
 *           (pasting a whole code works). 5 wrong codes lock this number for 15 minutes.
 *   Step 3  "Allow UNIVAULT to see": says exactly what is shared and shows the record the simulated
 *           issuer returns. Allow starts the session; Cancel goes back.
 * The server does every real check (src/app/api/auth/*); this file only displays and sends. The full
 * number is sent only to our own server and is never stored or logged; the browser keeps just what it needs.
 */
import { useEffect, useRef, useState } from "react";
import { post } from "@/components/api";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { format, validate, generate, NUMBER_LENGTH, digitsOnly, type Problem } from "@/lib/synthetic-aadhaar";

type Step = 1 | 2 | 3;
interface Record_ { name: string | null; dob: string | null; idMasked: string | null }

const CODE_LENGTH = 6;

export function SignInFlow({ initialNumber }: { initialNumber: string }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [number, setNumber] = useState(format(initialNumber));
  const [code, setCode] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [message, setMessage] = useState<string | null>(null);
  const [record, setRecord] = useState<Record_ | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  // When the step CHANGES (not on first load), move the screen reader to the new heading, and the
  // cursor into the first box on step 2.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    heading.current?.focus();
    if (step === 2) boxes.current[0]?.focus();
  }, [step]);

  const check = validate(number);
  const problem: Problem | null = check.ok ? null : check.problem;
  const typed = digitsOnly(number).length;
  const hint = problem && problem !== "empty" ? (problem === "incomplete" ? t("signin.err.incomplete", { n: NUMBER_LENGTH - typed }) : t(`signin.err.${problem}`)) : null;
  const shownError = problem === "not_demo" || problem === "too_long" || problem === "bad_check";

  const fail = (m: string) => { setMessage(m); announce(m); };
  const serverMessage = (data: { problem?: string; triesLeft?: number; retryAfterS?: number }) => {
    switch (data.problem) {
      case "wrong_code": return t("signin.err.wrongCode", { n: data.triesLeft ?? 0 });
      case "locked": return t("signin.err.locked", { min: Math.max(1, Math.ceil((data.retryAfterS ?? 900) / 60)) });
      case "expired": return t("signin.err.expired");
      case "slow_down": return t("signin.err.slowDown");
      case "not_configured": return t("signin.err.notConfigured");
      default: return t("api.failed");
    }
  };

  const sendCode = async () => {
    if (!check.ok) { fail(t(problem === "empty" ? "signin.err.empty" : problem === "incomplete" ? "signin.err.incomplete" : `signin.err.${problem}`, { n: NUMBER_LENGTH - typed })); return; }
    setBusy(true); setMessage(null);
    const r = await post<{ code?: string; problem?: string; retryAfterS?: number }>("/api/auth/code", { number: check.digits });
    setBusy(false);
    if (r.offline) return fail(t("api.offline"));
    if (!r.ok || !r.data.code) return fail(serverMessage(r.data));
    setCode(r.data.code); setDigits(Array(CODE_LENGTH).fill("")); setStep(2);
    announce(t("signin.codeShown"));
  };

  const checkCode = async () => {
    const entered = digits.join("");
    if (entered.length < CODE_LENGTH) return fail(t("signin.err.codeShort"));
    setBusy(true); setMessage(null);
    const r = await post<{ record?: Record_; problem?: string; triesLeft?: number; retryAfterS?: number }>("/api/auth/verify", { number: check.ok ? check.digits : "", code: entered });
    setBusy(false);
    if (r.offline) return fail(t("api.offline"));
    if (!r.ok || !r.data.record) {
      if (r.data.problem === "expired") { setStep(1); }
      return fail(serverMessage(r.data));
    }
    setRecord(r.data.record); setStep(3);
  };

  const allow = async () => {
    setBusy(true); setMessage(null);
    const r = await post<{ problem?: string }>("/api/auth/allow", {});
    if (!r.ok) { setBusy(false); if (r.data.problem === "expired") setStep(1); return r.offline ? fail(t("api.offline")) : fail(serverMessage(r.data)); }
    window.location.assign("/"); // a full load, so the server draws the signed-in pages
  };

  /** Put one or more digits into the boxes starting at box `i` (several digits = a paste or an autofill). */
  const spread = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "");
    const next = [...digits];
    if (!d) { next[i] = ""; setDigits(next); return; }
    for (let k = 0; k < d.length && i + k < CODE_LENGTH; k++) next[i + k] = d[k];
    setDigits(next);
    boxes.current[Math.min(i + d.length, CODE_LENGTH - 1)]?.focus();
  };
  const setDigit = (i: number, value: string) => spread(i, value.slice(-CODE_LENGTH));
  const onPaste = (i: number, e: React.ClipboardEvent) => { e.preventDefault(); spread(i, e.clipboardData.getData("text")); };
  const onKey = (i: number, e: React.KeyboardEvent) => { if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus(); };

  return (
    <section aria-labelledby="step-h">
      <div className="progress">
        <span className="step-label" aria-hidden="true">{t("signin.stepOf", { n: step, total: 3 })}</span>
        <progress value={step} max={3} aria-label={t("signin.stepOf", { n: step, total: 3 })} />
      </div>
      <h2 id="step-h" ref={heading} tabIndex={-1}>{t(`signin.step${step}.title`)}</h2>

      {step === 1 && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); sendCode(); }} noValidate>
          <div className="field">
            <label htmlFor="aad">{t("signin.number")}</label>
            <input id="aad" name="aadhaar" inputMode="numeric" autoComplete="off" pattern="[0-9 ]*" value={number}
              onChange={(e) => { setNumber(format(e.target.value)); setMessage(null); }}
              aria-invalid={shownError} aria-describedby="aad-hint aad-msg" maxLength={14} />
            <span id="aad-hint" className="hint-text">{t("signin.numberHint")}</span>
            <span id="aad-msg" className={shownError ? "field-error" : "hint-text"} aria-live="polite">{hint}</span>
          </div>
          <div className="row">
            <button type="button" className="text" onClick={() => { setNumber(format(generate())); setMessage(null); }}>{t("signin.useDemo")}</button>
          </div>
          {message && <p className="callout warn" role="alert">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? t("share.working") : t("signin.sendCode")}</button>
        </form>
      )}

      {step === 2 && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); checkCode(); }} noValidate>
          <p className="callout neutral" role="note">
            <strong>{t("signin.simulated")}</strong> {t("signin.yourCode")} <strong data-otp className="sim-code" aria-label={code.split("").join(" ")}>{code}</strong>
          </p>
          <fieldset className="otp" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>{t("signin.codeLabel")}</legend>
            <div className="otp-boxes">
              {digits.map((d, i) => (
                <input key={i} ref={(el) => { boxes.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={i === 0 ? CODE_LENGTH : 1}
                  aria-label={t("signin.digit", { n: i + 1, total: CODE_LENGTH })} onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={(e) => onPaste(i, e)}
                  onFocus={(e) => e.currentTarget.select()} />
              ))}
            </div>
          </fieldset>
          <p className="meta">{t("signin.codeValid")}</p>
          {message && <p className="callout warn" role="alert">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? t("share.working") : t("signin.checkCode")}</button>
          <div className="row">
            <button type="button" className="text" onClick={() => { setStep(1); setMessage(null); }}>{t("ui.back")}</button>
            <button type="button" className="text" onClick={sendCode} disabled={busy}>{t("signin.newCode")}</button>
          </div>
        </form>
      )}

      {step === 3 && record && (
        <div className="card stack">
          <p>{t("signin.consentIntro")}</p>
          <ul className="consent-list">
            <li>{t("signin.share.name")}</li>
            <li>{t("signin.share.dob")}</li>
            <li>{t("signin.share.id")}</li>
          </ul>
          <div className="record-card">
            <p className="meta"><strong>{t("signin.recordTitle")}</strong></p>
            <dl>
              <div><dt>{t("field.name")}</dt><dd>{record.name ?? t("signin.noRecord")}</dd></div>
              <div><dt>{t("field.dob")}</dt><dd>{record.dob ?? t("signin.noRecord")}</dd></div>
              <div><dt>{t("signin.idMasked")}</dt><dd>{record.idMasked ?? t("signin.noRecord")}</dd></div>
            </dl>
          </div>
          {message && <p className="callout warn" role="alert">{message}</p>}
          <button type="button" onClick={allow} disabled={busy}>{busy ? t("share.working") : t("signin.allow")}</button>
          <div className="row">
            <button type="button" className="text" onClick={() => { setStep(2); setMessage(null); }}>{t("ui.back")}</button>
            <button type="button" className="text" onClick={() => { setStep(1); setMessage(null); }}>{t("signin.cancel")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
