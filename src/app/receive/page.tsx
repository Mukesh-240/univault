/**
 * /receive — the receiver inbox: "Shared with you" (the shares addressed to THIS receiver, with the date access ends)
 * and "Your requests" (what it asked for, waiting or answered), plus one big button, "Ask for a document".
 * A signed-in SENDER can open this page too (Receiving mode) but has no inbox, and is told so plainly.
 */
import Link from "next/link";
import { Inbox, Send } from "lucide-react";
import { currentSession, receiverCode } from "@/lib/auth-server";
import { hasTelugu, showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { inboxFor, requestsFor } from "@/lib/receiver-portal";
import { personRecord } from "@/lib/person";
import { loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { RequestCards } from "./RequestCards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReceiveHome() {
  const { t } = await getI18n();
  const session = await currentSession();
  const code = receiverCode(session);
  if (!code) {
    return (
      <section className="empty-state">
        <Inbox size={44} aria-hidden="true" />
        <h1>{t("recv.noaccount.title")}</h1>
        <p>{t("recv.noaccount.body")}</p>
      </section>
    );
  }
  const [shares, requests, vault] = await Promise.all([inboxFor(supabase, code), requestsFor(supabase, code), loadDemoVault()]);
  const holder = personRecord(vault.docs).name ?? "";
  return (
    <>
      <section className="hero role-receiver">
        <h1>{t("recv.title")}</h1>
        <p className="lead">{t("recv.sub")}</p>
        <Link href="/receive/ask" className="btn"><Send size={22} aria-hidden="true" /> {t("recv.ask.btn")}</Link>
      </section>
      <section aria-labelledby="sh-h" className="stack-s">
        <h2 id="sh-h">{t("recv.shared.title")}</h2>
        {shares.length === 0 ? (
          <div className="empty-state"><Inbox size={40} aria-hidden="true" /><p>{t("recv.shared.none")}</p></div>
        ) : (
          <ul className="cards doc-grid">
            {shares.map((s) => {
              const live = s.state === "active" && !s.tokenKilled;
              const label = live ? "active" : s.state === "expired" ? "expired" : "revoked";
              return (
                <li key={s.id} className="card">
                  <div className="card-head">
                    <h3 lang={hasTelugu(holder) ? "te" : undefined}>{t("recv.from", { name: holder })}</h3>
                    <span className={`chip ${live ? "ok" : label === "expired" ? "warn" : "bad"}`}>{t(`recv.state.${label}`)}</span>
                  </div>
                  <p className="meta">{t("recv.items", { n: s.fields.length })} · {s.purpose}</p>
                  <p className="meta">{t("recv.until", { date: showTime(s.expiresAt).slice(0, 10) })}</p>
                  {live && <div className="card-actions"><Link className="btn" prefetch={false} href={`/receive/${s.id}`} aria-label={`${t("recv.open")}: ${holder}`}>{t("recv.open")}</Link></div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="rq-h" className="stack-s" style={{ marginTop: "var(--s4)" }}>
        <h2 id="rq-h">{t("recv.requests.title")}</h2>
        <RequestCards rows={requests.slice(0, 4).map((r) => ({ ...r, when: showTime(r.at), holder }))} />
        <Link href="/receive/requests" className="btn secondary">{t("nav.recv.side.requests")}</Link>
      </section>
    </>
  );
}
