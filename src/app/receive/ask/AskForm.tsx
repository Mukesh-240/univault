"use client";
/**
 * ASK FORM — who you are asking (search by name or demo ID, masked ID shown) and what you need (tick boxes grouped by
 * kind of document). "Send request" records it; the person sees it on their Alerts page and decides what to share.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { post } from "@/components/api";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";

interface Holder { ref: string; name: string; masked: string }

export function AskForm({ items }: { items: string[] }) {
  const { t, itemLabel, docTypeLabel } = useI18n();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Holder[] | null>(null);
  const [holder, setHolder] = useState<Holder | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const r = await post<{ holders?: Holder[] }>("/api/receive/holder", { q });
      if (live) setFound(r.ok ? r.data.holders ?? [] : []);
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  const groups = new Map<string, string[]>();
  for (const i of items) { const g = i.includes(".") ? i.split(".")[0] : "other"; groups.set(g, [...(groups.get(g) ?? []), i]); }
  const toggle = (i: string) => setTicked((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));

  const send = async () => {
    if (!holder) return;
    if (!ticked.length) { setMsg(t("recv.ask.none")); announce(t("recv.ask.none")); return; }
    setBusy(true); setMsg(null);
    const r = await post<{ to?: string; error?: string }>("/api/receive/ask", { holder_ref: holder.ref, items: ticked });
    setBusy(false);
    if (r.offline) { setMsg(t("api.offline")); return; }
    if (!r.ok) { setMsg(r.data.error ?? t("api.failed")); return; }
    setDone(r.data.to ?? holder.name); announce(t("recv.ask.done.title"));
  };

  if (done) {
    return (
      <section className="card stack" aria-labelledby="sent-h">
        <h2 id="sent-h">{t("recv.ask.done.title")}</h2>
        <p className="lead">{t("recv.ask.done.body", { name: done })}</p>
        <Link href="/receive/requests" className="btn">{t("recv.ask.requests")}</Link>
      </section>
    );
  }
  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="who-h">
        <h2 id="who-h">{t("recv.ask.who")}</h2>
        <div className="field">
          <label htmlFor="ask-q">{t("recv.ask.search")}</label>
          <input id="ask-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
        <ul className="profile-cards">
          {(found ?? []).map((h) => (
            <li key={h.ref}>
              <button type="button" className={`profile-card role-sender${holder?.ref === h.ref ? " picked" : ""}`} aria-pressed={holder?.ref === h.ref} onClick={() => setHolder(h)}>
                <span className="avatar" aria-hidden="true">{h.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                <span className="profile-text"><strong>{h.name}</strong><span className="tabular meta">{h.masked}</span><span className="use">{holder?.ref === h.ref ? t("issuer.wiz.1.picked", { name: h.name, id: h.masked }) : t("recv.ask.choose")}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card stack" aria-labelledby="what-h">
        <h2 id="what-h">{t("recv.ask.what")}</h2>
        <p className="note">{t("recv.ask.hint")}</p>
        {[...groups.entries()].map(([g, list]) => (
          <fieldset key={g} className="radio-cards">
            <legend>{g === "other" ? t("doctype.other") : docTypeLabel(g)}</legend>
            {list.map((i) => <label key={i} className="radio-card"><input type="checkbox" checked={ticked.includes(i)} onChange={() => toggle(i)} /><span>{itemLabel(i)}</span></label>)}
          </fieldset>
        ))}
        {msg && <p className="callout warn" role="alert">{msg}</p>}
        <button type="button" onClick={send} disabled={busy || !holder}>{busy ? t("recv.ask.sending") : t("recv.ask.send")}</button>
      </section>
    </div>
  );
}
