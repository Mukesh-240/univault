"use client";
/** ELIGIBILITY FORM — pick the person (search by name or demo ID), see the criteria that apply, send the request. */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { post } from "@/components/api";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";

interface Holder { ref: string; name: string; masked: string }

export function EligibilityForm({ criteria }: { criteria: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Holder[]>([]);
  const [holder, setHolder] = useState<Holder | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => { const r = await post<{ holders?: Holder[] }>("/api/receive/holder", { q }); if (live) setFound(r.ok ? r.data.holders ?? [] : []); }, q ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);
  const send = async () => {
    if (!holder) return;
    const r = await post<{ error?: string; to?: string }>("/api/receive/eligibility", { holder_ref: holder.ref });
    const m = r.offline ? t("api.offline") : r.ok ? t("elig.sent", { name: r.data.to ?? holder.name }) : r.data.error ?? t("api.failed");
    setMsg(m); announce(m);
    if (r.ok) router.refresh();
  };
  return (
    <div className="card stack">
      <h2>{t("elig.who")}</h2>
      <div className="field"><label htmlFor="el-q">{t("recv.ask.search")}</label><input id="el-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></div>
      <ul className="profile-cards">
        {found.map((h) => (
          <li key={h.ref}><button type="button" className={`profile-card role-sender${holder?.ref === h.ref ? " picked" : ""}`} aria-pressed={holder?.ref === h.ref} onClick={() => setHolder(h)}>
            <span className="avatar" aria-hidden="true">{h.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
            <span className="profile-text"><strong>{h.name}</strong><span className="tabular meta">{h.masked}</span><span className="use">{holder?.ref === h.ref ? t("issuer.wiz.1.picked", { name: h.name, id: h.masked }) : t("recv.ask.choose")}</span></span>
          </button></li>
        ))}
      </ul>
      <h3>{t("elig.criteria")}</h3>
      <ul className="rules">{criteria.map((c) => <li key={c}>{c}</li>)}</ul>
      {msg && <p className="callout neutral" role="status">{msg}</p>}
      <button type="button" disabled={!holder} onClick={send}>{t("elig.send")}</button>
    </div>
  );
}
