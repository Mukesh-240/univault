/**
 * MORE — everything that is not one of the five main tabs, each with one plain line saying what it is.
 * "Stop all sharing" has its own area at the bottom, far from the normal "Stop sharing" button, and asks
 * first. "For demonstration" (the fault panel) is labelled as such: it only pretends things go wrong.
 */
import { BadgeCheck, BookOpen, FlaskConical, History, Inbox, Lightbulb, ScanLine, ScrollText, ShieldAlert, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { getI18n } from "@/lib/i18n-server";
import { DEMO_OWNER } from "@/lib/server";
import { loadShares } from "@/lib/share-store";
import { supabase } from "@/lib/supabase";
import { KillAll } from "../shares/ShareActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ITEMS: [string, string, string, LucideIcon][] = [
  ["/receive", "mode.receiving", "more.receiving", Inbox],
  ["/ocr", "nav.ocr", "more.ocr", ScanLine],
  ["/names", "nav.names", "more.names", Users],
  ["/verify", "nav.verify", "more.verify", BadgeCheck],
  ["/ledger", "nav.ledger", "more.ledger", History],
  ["/leak-trace", "nav.leak", "more.leak", ScrollText],
  ["/assistant", "nav.assistant", "more.assistant", Lightbulb],
  ["/threat-model", "footer.threatModel", "more.threat", ShieldAlert],
  ["/policy", "footer.policy", "more.policy", BookOpen],
  ["/faults", "nav.faults", "more.faults", FlaskConical],
];

export default async function MorePage() {
  const { t } = await getI18n();
  const shares = await loadShares(supabase, DEMO_OWNER);
  return (
    <>
      <h1>{t("more.title")}</h1>
      <p className="lead">{t("more.intro")}</p>
      <div className="grid">
        {ITEMS.map(([href, title, note, Icon]) => (
          <Link key={href} href={href} className="choice"><Icon size={32} aria-hidden="true" /><div><strong>{t(title)}</strong><span>{t(note)}</span></div></Link>
        ))}
      </div>
      <section className="card stack-s" aria-labelledby="stop-all-h" style={{ marginTop: "var(--s4)" }}>
        <h2 id="stop-all-h">{t("more.stopAllTitle")}</h2>
        <p>{t("more.stopAllNote")}</p>
        <KillAll disabled={!shares.some((s) => s.state === "active")} />
      </section>
    </>
  );
}
