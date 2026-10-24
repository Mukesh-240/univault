"use client";
/**
 * SHARE WIZARD — four steps, one question each, with a progress bar and a Back button that is always there.
 *   1  Who is asking?            (big cards, one per recipient)
 *   2  What do they need?        (tick boxes; only what the request needs is ticked to start with)
 *   3  For how long?             (1, 7 or 30 days; and whether they may download a stamped copy)
 *   4  Review and send           (the server re-checks every document with the issuer, flags a request that
 *                                 asks for too much, and shows EXACTLY what they will see; then "Share now")
 * Nothing is shared until "Share now". Changing any choice after the review throws the review away: you
 * always confirm what you saw. A dropped connection is safe: pressing again re-sends the SAME request key,
 * so it can never create a second share. The receipt shows the link once (only its fingerprint is stored).
 * The server routes are unchanged: POST /api/share/preview and POST /api/share/confirm.
 */
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { StateBadge } from "@/components/Badges";
import { Explain } from "@/components/Explain";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { Reason } from "@/components/Reason";
import { post } from "@/components/api";
import type { ShareDraft } from "@/lib/consent";
import type { Explanation } from "@/lib/explain";
import { hasTelugu, showTime } from "@/lib/i18n-core";
import { watermarkBackground } from "@/lib/watermark";

interface Recipient { code: string; name: string; purpose: string }
interface Pack { purpose: string; title: string; allowed: string[] }
interface Preview {
  recipient: { recipient_code: string; name: string };
  reverify: { id: string; title: string; state: string; reason: string }[];
  blocked: unknown[];
  recipientView: { fields: Record<string, string>; attestations: Record<string, boolean>; withheld: string[]; statement: string };
  overbroad: { flagged: boolean; minimal: string[]; explanation: Explanation };
  previewToken: string;
}
interface Receipt {
  share_id: string; created_at: string; recipient: { code: string; name: string }; purpose: string; fields: string[]; expires_at: string;
  policy: ShareDraft["policy"]; link: string; verified: { title: string; state: string }[]; ledger_ok?: boolean;
}

const DAY_MS = 86_400_000;
const DAY_CHOICES = [1, 7, 30] as const;
type Step = 1 | 2 | 3 | 4;

export function ShareBuilder({ recipients, items, packs, from }: { recipients: Recipient[]; items: string[]; packs: Pack[]; from?: string }) {
  const { lang, t, fieldLabel, docTypeLabel, itemLabel } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [code, setCode] = useState(recipients[0]?.code ?? "");
  const recipient = recipients.find((r) => r.code === code);
  const purposeOf = (r?: Recipient) => (packs.some((p) => p.purpose === r?.purpose) ? r!.purpose : packs[0]?.purpose ?? "");
  const purpose = purposeOf(recipient);
  const allowedFor = (p: string) => (packs.find((x) => x.purpose === p)?.allowed ?? []).filter((i) => items.includes(i));
  const [fields, setFields] = useState<string[]>(allowedFor(purpose));
  const [days, setDays] = useState<(typeof DAY_CHOICES)[number]>(7);
  const [mode, setMode] = useState<"view_only" | "download">("view_only");
  const [draft, setDraft] = useState<ShareDraft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [idemKey, setIdemKey] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  /** Any change discards the review (and its request key): you must review what you confirm. */
  const reset = () => { setPreview(null); setDraft(null); setIdemKey(null); setReceipt(null); setMessage(null); };
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const i of items) (g[i.split(".")[0]] ??= []).push(i);
    // "Share a part of this" from a document page: that document's group comes first.
    return Object.entries(g).sort(([a], [b]) => (a === from ? -1 : b === from ? 1 : 0));
  }, [items, from]);

  const go = (s: Step) => { setStep(s); setMessage(null); requestAnimationFrame(() => heading.current?.focus()); };

  const review = async () => {
    const d: ShareDraft = { recipient_code: code, purpose, fields: [...fields].sort(), expires_at: new Date(Date.now() + days * DAY_MS).toISOString(), policy: { mode } };
    setBusy(true); setMessage(null);
    const r = await post<Preview & { error?: string }>("/api/share/preview", d);
    setBusy(false);
    if (!r.ok) { const m = r.offline ? t("api.offline") : r.data.error ?? t("api.failed"); setMessage(m); announce(m); return; }
    setDraft(d); setPreview(r.data); setIdemKey(crypto.randomUUID()); go(4);
    announce(t("share.previewReady"));
  };

  const send = async () => {
    if (!draft || !preview || !idemKey) return;
    setBusy(true); setMessage(null);
    const r = await post<{ receipt?: Receipt; error?: string }>("/api/share/confirm", { draft, preview_token: preview.previewToken, idempotency_key: idemKey });
    setBusy(false);
    if (r.offline) { setMessage(t("share.retrySafe")); announce(t("share.retrySafe")); return; }
    if (!r.ok || !r.data.receipt) { const m = r.data.error ?? t("api.failed"); setMessage(m); announce(m); return; }
    setReceipt(r.data.receipt);
    announce(t("share.created", { name: r.data.receipt.recipient.name }));
  };

  const bg = useMemo(() => recipient ? watermarkBackground({ name: recipient.name, recipientCode: recipient.code, time: t("share.sampleTime"), session: "SAMPLE" }) : undefined, [recipient, t]);

  if (receipt) return <ReceiptView r={receipt} />;

  return (
    <div className="stack">
      <div className="progress">
        <span className="step-label" aria-hidden="true">{t("signin.stepOf", { n: step, total: 4 })}</span>
        <progress value={step} max={4} aria-label={t("signin.stepOf", { n: step, total: 4 })} />
      </div>
      <h2 ref={heading} tabIndex={-1}>{t(`wiz.${step}.title`)}</h2>

      {step === 1 && (
        <fieldset className="radio-cards">
          <legend className="sr-only">{t("wiz.1.title")}</legend>
          {recipients.map((r) => (
            <label key={r.code} className="radio-card" htmlFor={`rcp-${r.code}`}>
              <input id={`rcp-${r.code}`} type="radio" name="recipient" checked={code === r.code}
                onChange={() => { setCode(r.code); setFields(allowedFor(purposeOf(r))); reset(); }} />
              <span>{r.name}<small>{r.purpose}</small></span>
            </label>
          ))}
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend className="sr-only">{t("wiz.2.title")}</legend>
          <p className="note">{t("wiz.2.note")}</p>
          {groups.map(([type, list]) => (
            <div key={type} className="item-group">
              <p><strong>{docTypeLabel(type)}</strong></p>
              {list.map((i) => {
                const id = `it-${i.replace(".", "-")}`;
                return (
                  <div key={i} className="toggle">
                    <input type="checkbox" id={id} checked={fields.includes(i)}
                      onChange={(e) => { setFields(e.target.checked ? [...fields, i] : fields.filter((x) => x !== i)); reset(); }} />
                    <label htmlFor={id}>{fieldLabel(i.split(".")[1])}</label>
                  </div>
                );
              })}
            </div>
          ))}
        </fieldset>
      )}

      {step === 3 && (
        <>
          <fieldset className="radio-cards">
            <legend>{t("wiz.3.title")}</legend>
            {DAY_CHOICES.map((d) => (
              <label key={d} className="radio-card" htmlFor={`days-${d}`}>
                <input id={`days-${d}`} type="radio" name="days" checked={days === d} onChange={() => { setDays(d); reset(); }} />{t(`wiz.days.${d}`)}
              </label>
            ))}
          </fieldset>
          <fieldset className="radio-cards">
            <legend>{t("wiz.copy.title")}</legend>
            <label className="radio-card" htmlFor="pol-view"><input id="pol-view" type="radio" name="policy" checked={mode === "view_only"} onChange={() => { setMode("view_only"); reset(); }} />{t("wiz.copy.no")}</label>
            <label className="radio-card" htmlFor="pol-dl"><input id="pol-dl" type="radio" name="policy" checked={mode === "download"} onChange={() => { setMode("download"); reset(); }} />{t("wiz.copy.yes")}</label>
          </fieldset>
        </>
      )}

      {step === 4 && preview && draft && (
        <div className="stack">
          <p>{t("wiz.4.note", { name: preview.recipient.name })}</p>
          <section aria-labelledby="pv-h" className="card">
            <h3 id="pv-h">{t("share.reverified")}</h3>
            <ul>
              {preview.reverify.map((d) => <li key={d.id}>{d.title}: <StateBadge state={d.state} t={t} /> <Reason text={d.reason} lang={lang} /></li>)}
            </ul>
          </section>
          {preview.blocked.length > 0 && <p className="callout warn" role="alert">{t("share.blocked")}</p>}
          {preview.overbroad.flagged && (
            <div className="callout neutral">
              <p><strong>{t("share.overbroad")}</strong></p>
              <details className="expert"><summary>{t("ui.experts")}</summary>
                <Explain explanation={preview.overbroad.explanation} kind="over_broad" targetId={`${draft.recipient_code}:${draft.purpose}`} />
              </details>
              <button type="button" className="secondary" onClick={() => { setFields(preview.overbroad.minimal); reset(); go(2); }}>{t("share.useMinimal", { n: preview.overbroad.minimal.length })}</button>
            </div>
          )}
          <div className="card watermarked" style={{ backgroundImage: bg }}>
            <h3>{t("share.exactly")}</h3>
            <table className="fields"><tbody>
              {Object.entries(preview.recipientView.fields).map(([k, v]) => <tr key={k}><th scope="row">{itemLabel(k)}</th><td lang={hasTelugu(v) ? "te" : undefined}>{v}</td></tr>)}
              {Object.entries(preview.recipientView.attestations).map(([k, v]) => <tr key={k}><th scope="row">{itemLabel(k)}</th><td>{t(v ? "preview.yes" : "preview.no")} ({t("share.attested")})</td></tr>)}
            </tbody></table>
            {preview.recipientView.withheld.length > 0 && (
              <p className="callout neutral">{t("share.withheld", { list: preview.recipientView.withheld.map((k) => itemLabel(k)).join(", ") })}</p>
            )}
            <p className="note">{t("preview.attestationNote")}</p>
            <p className="note">{t("share.summary", { days, policy: t(mode === "view_only" ? "share.viewOnly" : "share.download"), until: showTime(draft.expires_at) })}</p>
          </div>
          <p className="note">{t("share.confirmNote")}</p>
        </div>
      )}

      {message && <p className="callout warn" role="alert">{message}</p>}

      <div className="wizard-nav">
        {step > 1 ? <button type="button" className="text" onClick={() => go((step - 1) as Step)}>{t("ui.back")}</button> : <Link href="/shares" className="btn text">{t("ui.back")}</Link>}
        {step < 3 && <button type="button" disabled={step === 2 && fields.length === 0} onClick={() => go((step + 1) as Step)}>{t("ui.next")}</button>}
        {step === 3 && <button type="button" disabled={busy || fields.length === 0} onClick={review}>{busy ? t("share.working") : t("wiz.review")}</button>}
        {step === 4 && <button type="button" disabled={busy || !preview || preview.blocked.length > 0} onClick={send}>{busy ? t("share.working") : t("share.confirm")}</button>}
      </div>
      {step === 2 && fields.length === 0 && <p className="meta">{t("wiz.noneTicked")}</p>}
    </div>
  );
}

function ReceiptView({ r }: { r: Receipt }) {
  const { lang, t, fieldLabel, docTypeLabel, itemLabel } = useI18n();
  return (
    <section className="card stack-s" aria-labelledby="rc-h">
      <h2 id="rc-h">{t("receipt.title")}</h2>
      <p className="callout ok">{t("receipt.done", { name: r.recipient.name })}</p>
      <dl className="receipt">
        <div><dt>{t("share.recipient")}</dt><dd>{r.recipient.name}</dd></div>
        <div><dt>{t("receipt.recipientId")}</dt><dd><code>{r.recipient.code}</code></dd></div>
        <div><dt>{t("share.purpose")}</dt><dd>{r.purpose}</dd></div>
        <div><dt>{t("share.items")}</dt><dd>{r.fields.map((f) => itemLabel(f)).join(", ")}</dd></div>
        <div><dt>{t("receipt.expires")}</dt><dd>{showTime(r.expires_at)}</dd></div>
        <div><dt>{t("share.policy")}</dt><dd>{t(r.policy.mode === "view_only" ? "share.viewOnly" : "share.download")}{r.policy.max_views ? ` · ${t("receipt.maxViews", { n: r.policy.max_views })}` : ""}</dd></div>
        <div><dt>{t("share.reverified")}</dt><dd>{r.verified.map((v) => `${v.title}: ${t(`state.${v.state}`)}`).join("; ")}</dd></div>
        <div><dt>{t("receipt.ledger")}</dt><dd>{r.ledger_ok === false ? t("ledger.broken", { line: "?" }) : t("receipt.ledgerOk")}</dd></div>
      </dl>
      <label htmlFor="rc-link">{t("receipt.link")}</label>
      <input id="rc-link" readOnly value={r.link} onFocus={(e) => e.currentTarget.select()} className="wide" />
      <p>{t("receipt.codeHow")} <span className="chip unk">SIMULATED</span></p>
      <p className="note">{t("receipt.once")}</p>
      <p><Link href="/shares" className="btn">{t("receipt.manage")}</Link></p>
    </section>
  );
}
