/**
 * WHAT UNIVAULT CAN DO — every feature in plain words, in three groups (Keep and prove, Share safely, Stay in control),
 * each with an HONEST status (Built / Partly built / Not built, from src/config/features.json, which follows
 * docs/GAP_AUDIT.md) and a "Try it" button that opens the right screen. Open to every signed-in role.
 */
import {
  BadgeCheck, Ban, Copy, Eraser, FilePlus2, History, Inbox, KeyRound, ListChecks, ScanLine, Search, Send, ShieldCheck, Stamp, Users, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import features from "@/config/features.json";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const ICONS: Record<string, LucideIcon> = { BadgeCheck, Ban, Copy, Eraser, FilePlus2, History, Inbox, KeyRound, ListChecks, ScanLine, Search, Send, ShieldCheck, Stamp, Users };
const TONE: Record<string, string> = { built: "ok", partial: "warn", missing: "unk" };

export default async function FeaturesPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHead title={t("features.title")} purpose={t("features.purpose")} action={{ href: "/demo", label: t("demo.link") }} />
      {features.groups.map((g) => (
        <section key={g.id} aria-labelledby={`fg-${g.id}`} className="section">
          <h2 id={`fg-${g.id}`} className="h3">{t(`features.group.${g.id}`)}</h2>
          <ul className="feature-grid">
            {g.features.map((f) => {
              const Icon = ICONS[f.icon] ?? BadgeCheck;
              return (
                <li key={f.id} className="card feature">
                  <div className="feature-top"><span className="tile-ic" aria-hidden="true"><Icon size={20} /></span>
                    <span className={`chip ${TONE[f.status]}`}>{t(`features.status.${f.status}`)}</span></div>
                  <h3>{t(`features.${f.id}.title`)}</h3>
                  <p>{t(`features.${f.id}.line`)}</p>
                  <p className="meta">{t("features.as", { role: t(`signin.role.${f.role}.tag`) })}</p>
                  {f.status !== "missing" && <Link href={f.href} className="btn secondary btn-small" data-feature={f.id} aria-label={`${t("features.try")}: ${t(`features.${f.id}.title`)}`}>{t("features.try")}</Link>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
