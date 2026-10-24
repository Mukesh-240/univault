"use client";
/**
 * SIGN-IN FLOW — pick a role, pick a demo profile, enter the simulated code, allow. One main task per screen.
 *
 *   Role     three big cards: "I issue documents", "I keep and share my documents", "I received or need a document".
 *   Profile  demo profiles for that role (initials, name, role tag, masked demo ID). "Use a different demo number"
 *            opens the number step instead (12 digits starting 0000, grouped in fours, check digit verified).
 *   Code     the SIMULATED code is shown in a "Demo" pill (no SMS is sent); six big boxes (pasting works).
 *            5 wrong codes lock that number for 15 minutes (the server counts).
 *   Consent  says exactly what is shared (name, date of birth if there is one, masked ID). Allow starts the session.
 * The server does every real check (src/app/api/auth/*); this file only displays and sends. The full number is sent
 * only to our own server and is never stored or logged.
 */
import { FilePlus2, FolderLock, Inbox, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { post } from "@/components/api";
import { useI18n } from "@/components/I18n";
import { useStepMotion } from "@/components/useStepMotion";
import { Stepper, StepTrail } from "@/components/Steps";
import { signInTrail } from "@/lib/trail";
import { announce } from "@/components/Live";
import { format, validate, generate, NUMBER_LENGTH, digitsOnly, type Problem } from "@/lib/synthetic-aadhaar";

type Step = "role" | "profile" | "number" | "code" | "consent";
type Role = "issuer" | "sender" | "receiver";
export interface ClientProfile { role: Role; ref: string; name: string; number: string; masked: string; uvId: string; type: string; category: string | null }
interface Record_ { name: string | null; dob: string | null; idMasked: string | null }
interface Chosen { role: Role; ref?: string; name?: string }

const ROLE_CARDS: { role: Role; Icon: LucideIcon }[] = [
  { role: "issuer", Icon: FilePlus2 }, { role: "sender", Icon: FolderLock }, { role: "receiver", Icon: Inbox },
];
/** Which of the 3 progress steps a screen is (the role cards come before the steps). */
const PROGRESS: Record<Step, number> = { role: 0, profile: 1, number: 1, code: 2, consent: 3 };
const CODE_LENGTH = 6;
const ORDER: Step[] = ["role", "profile", "number", "code", "consent"];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export function SignInFlow({ profiles, initialNumber }: { profiles: ClientProfile[]; initialNumber: string }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("role");
  const [who, setWho] = useState<Chosen>({ role: "sender" });
  const [number, setNumber] = useState(format(initialNumber));
  const [numberDigits, setNumberDigits] = useState("");
  const [code, setCode] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [message, setMessage] = useState<string | null>(null);
  const [record, setRecord] = useState<Record_ | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const root = useRef<HTMLElement>(null);
  useStepMotion(root, ORDER.indexOf(step));

  // When the step CHANGES (not on first load), move the screen reader to the new heading, and the
  // cursor into the first box on the code step.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    heading.current?.focus();
    if (step === "code") boxes.current[0]?.focus();
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
      case "unknown_profile": return t("signin.profile.empty");
      default: return t("api.failed");
    }
  };

  /** Ask the server for a code for this number and profile, then show the code step. */
  const sendCode = async (digitsToSend: string, chosen: Chosen = who) => {
    setBusy(true); setMessage(null);
    const r = await post<{ code?: string; problem?: string; retryAfterS?: number }>("/api/auth/code", { number: digitsToSend, role: chosen.role, ref: chosen.ref });
    setBusy(false);
    if (r.offline) return fail(t("api.offline"));
    if (!r.ok || !r.data.code) return fail(serverMessage(r.data));
    setNumberDigits(digitsToSend);
    setCode(r.data.code); setDigits(Array(CODE_LENGTH).fill("")); setStep("code");
    announce(t("signin.codeShown"));
  };

  /** The typed number: check it in plain words first, then ask for a code. */
  const submitNumber = () => {
    if (!check.ok) { fail(t(problem === "empty" ? "signin.err.empty" : problem === "incomplete" ? "signin.err.incomplete" : `signin.err.${problem}`, { n: NUMBER_LENGTH - typed })); return; }
    return sendCode(check.digits);
  };

  const pickProfile = (p: ClientProfile) => { const chosen = { role: p.role, ref: p.ref, name: p.name }; setWho(chosen); return sendCode(digitsOnly(p.number), chosen); };

  const checkCode = async () => {
    const entered = digits.join("");
    if (entered.length < CODE_LENGTH) return fail(t("signin.err.codeShort"));
    setBusy(true); setMessage(null);
    const r = await post<{ record?: Record_; problem?: string; triesLeft?: number; retryAfterS?: number }>("/api/auth/verify", { number: numberDigits, code: entered });
    setBusy(false);
    if (r.offline) return fail(t("api.offline"));
    if (!r.ok || !r.data.record) {
      if (r.data.problem === "expired") setStep("profile");
      return fail(serverMessage(r.data));
    }
    setRecord(r.data.record); setStep("consent");
  };

  const allow = async () => {
    setBusy(true); setMessage(null);
    const r = await post<{ problem?: string; home?: string }>("/api/auth/allow", {});
    if (!r.ok) { setBusy(false); if (r.data.problem === "expired") setStep("profile"); return r.offline ? fail(t("api.offline")) : fail(serverMessage(r.data)); }
    window.location.assign(r.data.home ?? "/"); // a full load, so the server draws the signed-in pages
  };

  /** Put one or more digits into the boxes starting at box `i` (several digits = a paste or an autofill). */
  const spread = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "");
    // Functional update: two quick changes to the same box (clear, then type) must both count.
    setDigits((prev) => {
      const next = [...prev];
      if (!d) { next[i] = ""; return next; }
      for (let k = 0; k < d.length && i + k < CODE_LENGTH; k++) next[i + k] = d[k];
      return next;
    });
    if (d) boxes.current[Math.min(i + d.length, CODE_LENGTH - 1)]?.focus();
  };
  // No maxLength on the boxes (some browsers then refuse to replace a selected digit); keep the newest digit instead.
  const setDigit = (i: number, value: string) => spread(i, i === 0 ? value.slice(-CODE_LENGTH) : value.slice(-1));
  const onPaste = (i: number, e: React.ClipboardEvent) => { e.preventDefault(); spread(i, e.clipboardData.getData("text")); };
  const onKey = (i: number, e: React.KeyboardEvent) => { if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus(); };

  const mine = profiles.filter((p) => p.role === who.role);
  const progress = PROGRESS[step];
  const pill = t("signin.demoPill", { code: "\u0001" }).split("\u0001");
  const title = step === "role" ? t("signin.role.title") : step === "profile" ? t("signin.step.profile") : t(`signin.step${step === "number" ? 1 : step === "code" ? 2 : 3}.title`);

  return (
    <section aria-labelledby="step-h" data-step={step} ref={root}>
      {progress > 0 && <Stepper steps={["stepper.signin.1", "stepper.signin.2", "stepper.signin.3"]} current={progress} here={`stepper.signin.${progress}.here`} next={`stepper.signin.${progress}.next`} />}
      <h2 id="step-h" ref={heading} tabIndex={-1}>{title}</h2>

      {step === "role" && (
        <div className="role-cards">
          {ROLE_CARDS.map(({ role, Icon }) => (
            <article key={role} className={`role-card role-${role}`}>
              <span className="role-icon" aria-hidden="true"><Icon size={34} /></span>
              <h3>{t(`signin.role.${role}.title`)}</h3>
              <p>{t(`signin.role.${role}.body`)}</p>
              <button type="button" onClick={() => { setWho({ role }); setStep("profile"); setMessage(null); }}>{t(`signin.role.${role}.btn`)}</button>
            </article>
          ))}
        </div>
      )}

      {step === "profile" && (
        <div className="stack">
          <p className="note">{t("signin.profile.sub")}</p>
          {message && <p className="callout warn" role="alert">{message}</p>}
          {mine.length === 0 ? <p className="callout neutral" role="status">{t("signin.profile.empty")}</p> : (
            <ul className="profile-cards">
              {mine.map((p) => (
                <li key={p.ref}>
                  <button type="button" className={`profile-card role-${p.role}`} disabled={busy} onClick={() => pickProfile(p)}>
                    <span className="avatar" aria-hidden="true">{initials(p.name)}</span>
                    <span className="profile-text">
                      <strong>{p.name}</strong>
                      <span className="chip role-chip">{t(`signin.role.${p.role}.tag`)}</span>
                      <span className="meta">{t(`acct.type.${p.type}`)}{p.category ? ` · ${t(`acct.cat.${p.category}`)}` : ""}</span>
                      <span className="tabular meta">{p.uvId} · {p.masked}</span>
                      <span className="meta">{t("acct.simulated")}</span>
                      <span className="use">{busy ? t("share.working") : t("signin.profile.use")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <button type="button" className="text" onClick={() => { setStep("number"); setMessage(null); }}>{t("signin.other")}</button>
            <button type="button" className="text" onClick={() => { setStep("role"); setMessage(null); }}>{t("ui.back")}</button>
          </div>
        </div>
      )}

      {step === "number" && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); submitNumber(); }} noValidate>
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
          <div className="row"><button type="button" className="text" onClick={() => { setStep("profile"); setMessage(null); }}>{t("ui.back")}</button></div>
        </form>
      )}

      {step === "code" && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); checkCode(); }} noValidate>
          <p className="demo-pill" role="note" aria-label={`${pill[0]}${code.split("").join(" ")}${pill[1] ?? ""}`}>
            {pill[0]}<strong data-otp className="sim-code">{code}</strong>{pill[1]}
          </p>
          <fieldset className="otp" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>{t("signin.codeLabel")}</legend>
            <div className="otp-boxes">
              {digits.map((d, i) => (
                <input key={i} ref={(el) => { boxes.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
                  aria-label={t("signin.digit", { n: i + 1, total: CODE_LENGTH })} onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={(e) => onPaste(i, e)}
                  onFocus={(e) => e.currentTarget.select()} />
              ))}
            </div>
          </fieldset>
          <p className="meta">{t("signin.codeValid")}</p>
          {message && <p className="callout warn" role="alert">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? t("share.working") : t("signin.checkCode")}</button>
          <div className="row">
            <button type="button" className="text" onClick={() => { setStep("profile"); setMessage(null); }}>{t("ui.back")}</button>
            <button type="button" className="text" onClick={() => sendCode(numberDigits)} disabled={busy}>{t("signin.newCode")}</button>
          </div>
          {/* Reaching this screen means the server accepted the demo number: the trail shows that. */}
          <StepTrail steps={signInTrail("code")} id="signin-trail-h" />
        </form>
      )}

      {step === "consent" && record && (
        <div className="card stack">
          <p>{t("signin.consentIntro")}</p>
          <ul className="consent-list">
            <li>{t("signin.share.name")}</li>
            {record.dob && <li>{t("signin.share.dob")}</li>}
            <li>{t("signin.share.id")}</li>
          </ul>
          <div className="record-card">
            <p className="meta"><strong>{t("signin.recordTitle")}</strong></p>
            <dl>
              <div><dt>{t("field.name")}</dt><dd>{record.name ?? t("signin.noRecord")}</dd></div>
              {record.dob && <div><dt>{t("field.dob")}</dt><dd>{record.dob}</dd></div>}
              <div><dt>{t("signin.idMasked")}</dt><dd className="tabular">{record.idMasked ?? t("signin.noRecord")}</dd></div>
            </dl>
          </div>
          {message && <p className="callout warn" role="alert">{message}</p>}
          <button type="button" onClick={allow} disabled={busy}>{busy ? t("share.working") : t("signin.allow")}</button>
          {/* Reaching this screen means the server accepted the demo number and the code: the trail shows that. */}
          <StepTrail steps={signInTrail("consent")} id="signin-trail-h" />
          <div className="row">
            <button type="button" className="text" onClick={() => { setStep("code"); setMessage(null); }}>{t("ui.back")}</button>
            <button type="button" className="text" onClick={() => { setStep("role"); setMessage(null); }}>{t("signin.cancel")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
