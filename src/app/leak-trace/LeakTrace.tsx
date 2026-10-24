"use client";
/** LEAK TRACE (interactive): sends the watermark text to POST /api/leak-trace and shows who it points to. */
import { useState } from "react";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { post } from "@/components/api";
import { showTime } from "@/lib/i18n-core";
import { Stepper, StepTrail, UnderTheHood } from "@/components/Steps";
import { leakTrail } from "@/lib/trail";

interface Match { session: string; recipientCode: string; recipientName: string; shareId: string; purpose: string; at: string; device: string | null }
interface Result { read: { recipientCode?: string; session?: string }; matches: Match[]; events: Record<string, { outcome: string; at: string; session: string | null; device: string | null }[]> }

export function LeakTrace() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const run = async () => {
    const r = await post<Result>("/api/leak-trace", { text });
    if (!r.ok) { announce(r.offline ? t("api.offline") : t("api.failed")); return; }
    setRes(r.data);
    announce(r.data.matches.length ? t("leak.found", { name: r.data.matches[0].recipientName }) : t("leak.notFound"));
  };
  return (
    <>
      <Stepper steps={["stepper.leak.1", "stepper.leak.2"]} current={res ? 2 : 1} here={res ? "stepper.leak.2.here" : "stepper.leak.1.here"} next={res ? undefined : "stepper.leak.1.next"} />
      <form className="panel" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label htmlFor="lt-text">{t("leak.label")}</label>
        <textarea id="lt-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} required maxLength={500} />
        <div className="row"><button type="submit">{t("leak.run")}</button></div>
      </form>
      {res && (
        <section className="panel" aria-labelledby="lt-h">
          <h2 id="lt-h">{t("leak.result")}</h2>
          <StepTrail steps={leakTrail({ found: res.matches.length > 0, recipientCode: res.matches[0]?.recipientCode, at: res.matches[0]?.at, session: res.matches[0]?.session })} id="leak-trail-h" />
          <UnderTheHood items={["watermark", "ledger"]} />
          <p>{t("leak.read", { code: res.read.recipientCode ?? "—", session: res.read.session ?? "—" })}</p>
          {res.matches.length === 0 ? <p>{t("leak.notFound")}</p> : res.matches.map((m) => (
            <div key={`${m.shareId}-${m.session}`} className="callout neutral">
              <p><strong>{t("leak.match", { name: m.recipientName, code: m.recipientCode, purpose: m.purpose })}</strong></p>
              <p>{t("leak.session", { session: m.session, at: showTime(m.at), device: m.device ?? "—" })}</p>
              <table>
                <caption>{t("leak.events")}</caption>
                <thead><tr><th scope="col">{t("shares.when")}</th><th scope="col">{t("shares.outcome")}</th><th scope="col">{t("shares.session")}</th><th scope="col">{t("shares.device")}</th></tr></thead>
                <tbody>{(res.events[m.shareId] ?? []).map((e, i) => <tr key={i}><td>{showTime(e.at)}</td><td>{t(`outcome.${e.outcome}`)}</td><td>{e.session ?? "—"}</td><td><code>{e.device ?? "—"}</code></td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
