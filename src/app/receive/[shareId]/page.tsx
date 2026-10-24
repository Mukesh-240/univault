/**
 * /receive/<share> — the receiver reads ONE share addressed to it, inside the app.
 *
 * Plain English: a green banner says when the documents behind this were checked with their issuer; a table lists the
 * items it is allowed to see (nothing else exists on this page), the whole page is covered with a faint watermark
 * (name, code, time, session), and "Report a problem" sends one of three fixed reasons to the sender. If the share is
 * not addressed to this receiver, or the sender stopped it, or it ran out, a plain sentence says so. Opening is logged
 * exactly like opening a link (so the sender is told about a first opening).
 */
import Link from "next/link";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { currentSession, receiverCode } from "@/lib/auth-server";
import { hasTelugu, itemLabel, showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { personRecord } from "@/lib/person";
import { openForReceiver } from "@/lib/receiver-portal";
import { loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { ReportBox } from "./ReportBox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ViewShare({ params }: { params: Promise<{ shareId: string }> }) {
  const { lang, t } = await getI18n();
  const { shareId } = await params;
  const code = receiverCode(await currentSession());
  const r = code && /^[0-9a-f-]{36}$/.test(shareId) ? await openForReceiver(supabase, code, shareId) : null;
  if (!r || !r.ok) {
    return (
      <section className="empty-state" role="alert">
        <h1>{t(`recv.gone.${r && !r.ok ? r.reason : "not_found"}`)}</h1>
        <Link className="btn" href="/receive">{t("recv.gone.back")}</Link>
      </section>
    );
  }
  const holder = personRecord((await loadDemoVault()).docs).name ?? "";
  const fields = Object.entries(r.view.fields), atts = Object.entries(r.view.attestations);
  return (
    <div className="watermarked" style={{ backgroundImage: r.background }}>
      <h1 lang={hasTelugu(holder) ? "te" : undefined}>{t("recv.view.title", { name: holder })}</h1>
      <p className={`verified-banner ${r.checkedAt ? "ok" : "unk"}`} role="status">
        {r.checkedAt ? <ShieldCheck size={26} aria-hidden="true" /> : <ShieldQuestion size={26} aria-hidden="true" />}
        <strong>{r.checkedAt ? t("recv.view.banner", { time: showTime(r.checkedAt) }) : t("recv.view.nocheck")}</strong>
      </p>
      <section className="card" aria-labelledby="al-h">
        <h2 id="al-h">{t("recv.view.allowed")}</h2>
        <dl className="receipt">
          {fields.map(([k, v]) => <div key={k}><dt>{itemLabel(lang, k)}</dt><dd lang={hasTelugu(v) ? "te" : undefined}>{v}</dd></div>)}
          {atts.map(([k, v]) => <div key={k}><dt>{itemLabel(lang, k)}</dt><dd>{t(v ? "preview.yes" : "preview.no")} ({t("share.attested")})</dd></div>)}
        </dl>
        {fields.length + atts.length === 0 && <p>{t("preview.none")}</p>}
        <p className="note">{r.view.statement}</p>
      </section>
      <section className="card" aria-labelledby="dd-h">
        <h2 id="dd-h">{t("recv.view.docs")}</h2>
        <ul>{r.docs.map((d) => <li key={d.title}>{d.title}: {t(`state.${d.state}`)}</li>)}</ul>
        <p className="meta">{t("recv.view.until", { date: showTime(r.share.expiresAt).slice(0, 10) })}</p>
        <p className="meta">{t("recv.view.watermark")}: <span data-watermark>{r.watermark}</span></p>
      </section>
      <ReportBox shareId={r.share.id} />
    </div>
  );
}
