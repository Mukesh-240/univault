/**
 * ACTIVITY LIST — the issuer recent ledger lines as plain sentences with the time, newest first.
 * "You issued Degree certificate SSU-DC-123456." / "You stopped ..." / "You replaced A with B."
 */
import { getI18n } from "@/lib/i18n-server";

export interface ActivityItem { seq: number; kind: string; when: string; serial: string; type: string; by: string | null }

export async function ActivityList({ items }: { items: ActivityItem[] }) {
  const { t } = await getI18n();
  if (items.length === 0) return <p className="card">{t("issuer.recent.none")}</p>;
  return (
    <ol className="timeline">
      {items.map((a) => (
        <li key={a.seq}>
          <span className="meta">{a.when}</span><br />
          {a.kind === "issuer.issued" ? t("issuer.act.issued", { type: a.type, serial: a.serial })
            : a.kind === "issuer.superseded" ? t("issuer.act.superseded", { serial: a.serial, by: a.by ?? "" })
            : t("issuer.act.revoked", { serial: a.serial })}
        </li>
      ))}
    </ol>
  );
}
