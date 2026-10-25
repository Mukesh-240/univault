"use client";
/**
 * READY CARD — "Ready for…" on Home: ONE card with a purpose picker (Job / Scholarship / Overseas check) and one ring,
 * one sentence and "See what is missing". The numbers come from the readiness rules on the server (passed in);
 * this card only switches which purpose is shown.
 */
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/I18n";
import { ReadyRing } from "@/components/ReadyRing";

export interface PackSummary { id: string; title: string; total: number; done: number; open: number }

export function ReadyCard({ packs }: { packs: PackSummary[] }) {
  const { t } = useI18n();
  const [id, setId] = useState(packs[0]?.id ?? "");
  const p = packs.find((x) => x.id === id) ?? packs[0];
  if (!p) return null;
  return (
    <section aria-labelledby="ready-h" className="card ready-one">
      <div className="section-head">
        <h2 id="ready-h" className="h3">{t("home2.readyFor")}</h2>
        <label className="sr-only" htmlFor="ready-pick">{t("home2.readyPick")}</label>
        <select id="ready-pick" value={p.id} onChange={(e) => setId(e.target.value)}>
          {packs.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
      </div>
      <div className="ready-body">
        <ReadyRing done={p.done} total={p.total} label={t("home.ring.sr", { pack: p.title, done: p.done, total: p.total })} tone={p.open === 0 ? "ok" : "warn"} />
        <div>
          <p className="big">{p.open === 0 ? t("home.ready.ok", { pack: p.title }) : p.open === 1 ? t("home.ready.one", { pack: p.title }) : t("home.ready.n", { pack: p.title, n: p.open })}</p>
          <Link href={`/readiness#pack-${p.id}`} className="text-link">{p.open === 0 ? t("home.ready.btnOk") : t("home.ready.btn")}</Link>
        </div>
      </div>
    </section>
  );
}
