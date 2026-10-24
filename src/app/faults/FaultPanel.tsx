"use client";
/**
 * FAULT PANEL (interactive) — one block per fault: a switch or action, the defined response, the
 * recovery, and the latest result. Everything goes through real routes; nothing is faked here.
 *   issuer timeout     POST /api/faults (issuer stalls > 8 s)   -> verify shows "unreachable, retrying"
 *   stale data         POST /api/faults                         -> earlier verifications show "stale"
 *   malformed upload   POST /api/upload with a broken document  -> refused with reasons; counts unchanged
 *   conflicting update POST /api/faults (issuer publishes v+1)  -> verify shows the changed field
 *   connectivity loss  this browser only                        -> buttons send nothing and say so
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { get, OFFLINE_KEY, post } from "@/components/api";
import { fieldLabel } from "@/lib/i18n";

interface State { issuer_down: boolean; stale_since: string | null; offline_store: boolean; counts: { documents: number; ledger: number; shares: number; registry: number } }
interface Doc { id: string; title: string; fields: string[] }

export function FaultPanel({ docs }: { docs: Doc[] }) {
  const { lang, t } = useI18n();
  const [state, setState] = useState<State | null>(null);
  const [offline, setOffline] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [docId, setDocId] = useState(docs[0]?.id ?? "");
  const [field, setField] = useState(docs[0]?.fields[0] ?? "");
  const [value, setValue] = useState("");

  const refresh = async () => { const r = await get<State>("/api/faults"); if (r.ok) setState(r.data); return r.ok ? r.data : null; };
  useEffect(() => {
    refresh();
    try { setOffline(sessionStorage.getItem(OFFLINE_KEY) === "1"); } catch { /* storage blocked */ }
  }, []);

  const say = (key: string, msg: string) => { setResults((r) => ({ ...r, [key]: msg })); announce(msg); };

  const toggle = async (fault: "issuer_timeout" | "stale_data", on: boolean) => {
    const r = await post("/api/faults", { fault, on });
    say(fault, r.offline ? t("api.offline") : r.ok ? t(`faults.${fault}.${on ? "on" : "off"}`) : t("api.failed"));
    refresh();
  };

  const malformed = async () => {
    const before = await refresh();
    const r = await post<{ error?: string; problems?: string[] }>("/api/upload", { owner: "demo", doc_type: "Not A Type!", title: "", capture: "fax", fields: { "Bad Key": "x" }, synthetic: "yes" });
    const after = await refresh();
    if (r.offline) return say("malformed", t("api.offline"));
    say("malformed", t("faults.malformed.result", { status: r.status, problems: (r.data.problems ?? []).length,
      before: before?.counts.documents ?? "?", after: after?.counts.documents ?? "?" }));
  };

  const conflicting = async () => {
    const r = await post<{ new_version?: number; error?: string }>("/api/faults", { fault: "conflicting_update", document_id: docId, field, value });
    say("conflicting", r.offline ? t("api.offline") : r.ok ? t("faults.conflicting.result", { v: r.data.new_version ?? "?", field: fieldLabel(lang, field) }) : r.data.error ?? t("api.failed"));
    refresh();
  };

  const setConnectivity = (on: boolean) => {
    try { if (on) sessionStorage.setItem(OFFLINE_KEY, "1"); else sessionStorage.removeItem(OFFLINE_KEY); } catch { /* storage blocked */ }
    setOffline(on);
    say("connectivity", t(on ? "faults.connectivity.on" : "faults.connectivity.off"));
  };

  const doc = docs.find((d) => d.id === docId);
  const block = (key: string, control: React.ReactNode) => (
    <section className="panel" aria-labelledby={`f-${key}`}>
      <h2 id={`f-${key}`}>{t(`faults.${key}.title`)}</h2>
      <p><strong>{t("faults.response")}:</strong> {t(`faults.${key}.response`)}</p>
      <p><strong>{t("faults.recovery")}:</strong> {t(`faults.${key}.recovery`)}</p>
      {control}
      {results[key] && <p className="callout neutral">{results[key]}</p>}
    </section>
  );

  return (
    <>
      {state && (
        <p className="note">{t("faults.status", { docs: state.counts.documents, ledger: state.counts.ledger, shares: state.counts.shares, registry: state.counts.registry })}
          {state.offline_store ? ` · ${t("banner.offlineStore")}` : ""}</p>
      )}
      {block("issuer_timeout", (
        <div className="row">
          <button type="button" aria-pressed={state?.issuer_down ?? false} onClick={() => toggle("issuer_timeout", !state?.issuer_down)}>
            {state?.issuer_down ? t("faults.turnOff") : t("faults.turnOn")}
          </button>
          <span>{t(state?.issuer_down ? "faults.isOn" : "faults.isOff")}</span>
        </div>
      ))}
      {block("stale_data", (
        <div className="row">
          <button type="button" aria-pressed={Boolean(state?.stale_since)} onClick={() => toggle("stale_data", !state?.stale_since)}>
            {state?.stale_since ? t("faults.turnOff") : t("faults.turnOn")}
          </button>
          <span>{t(state?.stale_since ? "faults.isOn" : "faults.isOff")}</span>
        </div>
      ))}
      {block("malformed", (
        <div className="row"><button type="button" onClick={malformed}>{t("faults.malformed.send")}</button></div>
      ))}
      {block("conflicting", (
        <form className="row" onSubmit={(e) => { e.preventDefault(); conflicting(); }}>
          <label htmlFor="cu-doc">{t("faults.conflicting.doc")}</label>
          <select id="cu-doc" value={docId} onChange={(e) => { setDocId(e.target.value); setField(docs.find((d) => d.id === e.target.value)?.fields[0] ?? ""); }}>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <label htmlFor="cu-field">{t("faults.conflicting.field")}</label>
          <select id="cu-field" value={field} onChange={(e) => setField(e.target.value)}>
            {(doc?.fields ?? []).map((f) => <option key={f} value={f}>{fieldLabel(lang, f)}</option>)}
          </select>
          <label htmlFor="cu-value">{t("faults.conflicting.value")}</label>
          <input id="cu-value" value={value} onChange={(e) => setValue(e.target.value)} required />
          <button type="submit">{t("faults.conflicting.send")}</button>
        </form>
      ))}
      {block("connectivity", (
        <div className="row">
          <button type="button" aria-pressed={offline} onClick={() => setConnectivity(!offline)}>{offline ? t("faults.turnOff") : t("faults.turnOn")}</button>
          <span>{t(offline ? "faults.isOn" : "faults.isOff")}</span>
        </div>
      ))}
    </>
  );
}
