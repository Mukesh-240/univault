"use client";
/**
 * SHARE BUILDER (interactive). Three steps, each a server call:
 *   1. "Preview"  -> POST /api/share/preview: re-verifies the documents, flags an over-broad request
 *      (with a one-click minimal set), and returns EXACTLY what the recipient will see.
 *   2. "Confirm and share" -> POST /api/share/confirm with the preview token and an idempotency key.
 *      If the connection drops, pressing again re-sends the SAME key, so no duplicate share is made.
 *   3. The RECEIPT: the link and the recipient ID, shown once (the link is never stored). The recipient
 *      asks for a fresh one-time code on the link page (SIMULATED delivery: shown on screen).
 * Changing any choice after previewing throws the preview away: you must preview what you confirm.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { StateBadge } from "@/components/Badges";
import { Explain } from "@/components/Explain";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { Reason } from "@/components/Reason";
import { post } from "@/components/api";
import type { ShareDraft } from "@/lib/consent";
import type { Explanation } from "@/lib/explain";
import { fieldLabel, hasTelugu, showTime } from "@/lib/i18n";
import { watermarkBackground } from "@/lib/watermark";

interface Recipient { code: string; name: string; purpose: string }
interface Pack { purpose: string; title: string; allowed: string[] }
interface Preview {
  recipient: { recipient_code: string; name: string };
  reverify: { id: string; title: string; state: string; reason: string }[];
  blocked: unknown[];
  recipientView: { fields: Record<string, string>; attestations: Record<string, boolean>; statement: string };
  overbroad: { flagged: boolean; minimal: string[]; explanation: Explanation };
  previewToken: string;
}
interface Receipt {
  share_id: string; created_at: string; recipient: { code: string; name: string }; purpose: string; fields: string[]; expires_at: string;
  policy: ShareDraft["policy"]; link: string; verified: { title: string; state: string }[]; ledger_ok?: boolean;
}

const DAY_MS = 86_400_000;
const MAX_DAYS = 30;

export function ShareBuilder({ recipients, items, packs }: { recipients: Recipient[]; items: string[]; packs: Pack[] }) {
  const { lang, t } = useI18n();
  const [code, setCode] = useState(recipients[0]?.code ?? "");
  const recipient = recipients.find((r) => r.code === code);
  const [purpose, setPurpose] = useState(recipient?.purpose ?? packs[0]?.purpose ?? "");
  const allowedFor = (p: string) => (packs.find((x) => x.purpose === p)?.allowed ?? []).filter((i) => items.includes(i));
  const [fields, setFields] = useState<string[]>(allowedFor(purpose));
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<"view_only" | "download">("view_only");
  const [maxViews, setMaxViews] = useState("");
  const [draft, setDraft] = useState<ShareDraft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [idemKey, setIdemKey] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Any change after a preview discards it (and its idempotency key). */
  const changed = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPreview(null); setDraft(null); setIdemKey(null); setReceipt(null); setMessage(null); };
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const i of items) (g[i.split(".")[0]] ??= []).push(i);
    return g;
  }, [items]);
  const docLabel = (type: string) => { const s = t(`doctype.${type}`); return s === `doctype.${type}` ? type.replace(/_/g, " ") : s; };

  const doPreview = async () => {
    const d: ShareDraft = { recipient_code: code, purpose, fields: [...fields].sort(), expires_at: new Date(Date.now() + days * DAY_MS).toISOString(),
      policy: { mode, ...(maxViews ? { max_views: Number(maxViews) } : {}) } };
    setBusy(true); setMessage(null);
    const r = await post<Preview & { error?: string; problems?: string[] }>("/api/share/preview", d);
    setBusy(false);
    if (!r.ok) { const m = r.offline ? t("api.offline") : r.data.error ?? t("api.failed"); setMessage(m); announce(m); return; }
    setDraft(d); setPreview(r.data); setIdemKey(crypto.randomUUID());
    announce(t("share.previewReady"));
  };

  const doConfirm = async () => {
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
    <form className="panel" onSubmit={(e) => { e.preventDefault(); if (preview) doConfirm(); else doPreview(); }}>
      <div className="grid-2">
        <div>
          <label htmlFor="sh-recipient">{t("share.recipient")}</label>
          <select id="sh-recipient" value={code} onChange={(e) => { const r = recipients.find((x) => x.code === e.target.value); changed(setCode)(e.target.value); if (r) { setPurpose(r.purpose); setFields(allowedFor(r.purpose)); } }}>
            {recipients.map((r) => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sh-purpose">{t("share.purpose")}</label>
          <select id="sh-purpose" value={purpose} onChange={(e) => changed(setPurpose)(e.target.value)}>
            {packs.map((p) => <option key={p.purpose} value={p.purpose}>{p.title}</option>)}
          </select>
        </div>
      </div>

      <fieldset>
        <legend>{t("share.items")}</legend>
        <p className="note">{t("share.itemsNote")}</p>
        {Object.entries(groups).map(([type, list]) => (
          <div key={type} className="item-group">
            <p className="meta"><strong>{docLabel(type)}</strong></p>
            {list.map((i) => {
              const id = `it-${i.replace(".", "-")}`;
              return (
                <div key={i} className="toggle">
                  <input type="checkbox" id={id} checked={fields.includes(i)}
                    onChange={(e) => changed(setFields)(e.target.checked ? [...fields, i] : fields.filter((x) => x !== i))} />
                  <label htmlFor={id}>{fieldLabel(lang, i.split(".")[1])}</label>
                </div>
              );
            })}
          </div>
        ))}
      </fieldset>

      <div className="grid-2">
        <div>
          <label htmlFor="sh-days">{t("share.days", { max: MAX_DAYS })}</label>
          <input id="sh-days" type="number" min={1} max={MAX_DAYS} value={days} onChange={(e) => changed(setDays)(Math.max(1, Math.min(MAX_DAYS, Number(e.target.value) || 1)))} />
        </div>
        <fieldset>
          <legend>{t("share.policy")}</legend>
          <div className="toggle"><input type="radio" id="pol-view" name="policy" checked={mode === "view_only"} onChange={() => changed(setMode)("view_only")} /><label htmlFor="pol-view">{t("share.viewOnly")}</label></div>
          <div className="toggle"><input type="radio" id="pol-dl" name="policy" checked={mode === "download"} onChange={() => changed(setMode)("download")} /><label htmlFor="pol-dl">{t("share.download")}</label></div>
          <label htmlFor="sh-max">{t("share.maxViews")}</label>
          <input id="sh-max" type="number" min={1} max={100} value={maxViews} onChange={(e) => changed(setMaxViews)(e.target.value)} />
        </fieldset>
      </div>

      {!preview && <div className="row"><button type="submit" disabled={busy || !fields.length}>{busy ? t("share.working") : t("share.preview")}</button></div>}
      {message && <p className="callout warn" role="alert">{message}</p>}

      {preview && draft && (
        <section aria-labelledby="pv-h">
          <h2 id="pv-h">{t("share.previewTitle", { name: preview.recipient.name })}</h2>
          <h3>{t("share.reverified")}</h3>
          <ul>
            {preview.reverify.map((d) => <li key={d.id}>{d.title}: <StateBadge state={d.state} t={t} /> <Reason text={d.reason} lang={lang} /></li>)}
          </ul>
          {preview.blocked.length > 0 && <p className="callout warn">{t("share.blocked")}</p>}
          {preview.overbroad.flagged && (
            <div className="callout neutral">
              <p><strong>{t("share.overbroad")}</strong></p>
              <Explain explanation={preview.overbroad.explanation} kind="over_broad" targetId={`${draft.recipient_code}:${draft.purpose}`} />
              <button type="button" className="secondary" onClick={() => changed(setFields)(preview.overbroad.minimal)}>{t("share.useMinimal", { n: preview.overbroad.minimal.length })}</button>
            </div>
          )}
          <div className="card watermarked" style={{ backgroundImage: bg }}>
            <h3>{t("share.exactly")}</h3>
            <table className="fields"><tbody>
              {Object.entries(preview.recipientView.fields).map(([k, v]) => <tr key={k}><th scope="row">{docLabel(k.split(".")[0])} · {fieldLabel(lang, k.split(".")[1])}</th><td lang={hasTelugu(v) ? "te" : undefined}>{v}</td></tr>)}
              {Object.entries(preview.recipientView.attestations).map(([k, v]) => <tr key={k}><th scope="row">{fieldLabel(lang, k.split(".")[1])}</th><td>{t(v ? "preview.yes" : "preview.no")} ({t("share.attested")})</td></tr>)}
            </tbody></table>
            <p className="note">{t("preview.attestationNote")}</p>
            <p className="note">{t("share.summary", { days, policy: t(mode === "view_only" ? "share.viewOnly" : "share.download"), until: showTime(draft.expires_at) })}</p>
          </div>
          <div className="row">
            <button type="submit" disabled={busy || preview.blocked.length > 0}>{busy ? t("share.working") : t("share.confirm")}</button>
            <span className="note">{t("share.confirmNote")}</span>
          </div>
        </section>
      )}
    </form>
  );
}

function ReceiptView({ r }: { r: Receipt }) {
  const { lang, t } = useI18n();
  return (
    <section className="panel" aria-labelledby="rc-h">
      <h2 id="rc-h">{t("receipt.title")}</h2>
      <p className="callout ok">{t("receipt.done", { name: r.recipient.name })}</p>
      <dl className="receipt">
        <div><dt>{t("share.recipient")}</dt><dd>{r.recipient.name}</dd></div>
        <div><dt>{t("receipt.recipientId")}</dt><dd><code>{r.recipient.code}</code></dd></div>
        <div><dt>{t("share.purpose")}</dt><dd>{r.purpose}</dd></div>
        <div><dt>{t("share.items")}</dt><dd>{r.fields.map((f) => fieldLabel(lang, f.split(".")[1])).join(", ")}</dd></div>
        <div><dt>{t("receipt.expires")}</dt><dd>{showTime(r.expires_at)}</dd></div>
        <div><dt>{t("share.policy")}</dt><dd>{t(r.policy.mode === "view_only" ? "share.viewOnly" : "share.download")}{r.policy.max_views ? ` · ${t("receipt.maxViews", { n: r.policy.max_views })}` : ""}</dd></div>
        <div><dt>{t("share.reverified")}</dt><dd>{r.verified.map((v) => `${v.title}: ${t(`state.${v.state}`)}`).join("; ")}</dd></div>
        <div><dt>{t("receipt.ledger")}</dt><dd>{r.ledger_ok === false ? t("ledger.broken", { line: "?" }) : t("receipt.ledgerOk")}</dd></div>
      </dl>
      <label htmlFor="rc-link">{t("receipt.link")}</label>
      <input id="rc-link" readOnly value={r.link} onFocus={(e) => e.currentTarget.select()} className="wide" />
      <p>{t("receipt.codeHow")} <span className="badge state-not_checked">SIMULATED</span></p>
      <p className="note">{t("receipt.once")}</p>
      <p><Link href="/shares">{t("receipt.manage")}</Link></p>
    </section>
  );
}
