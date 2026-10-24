/** REQUEST CARDS — a receiver own requests: who it asked, how many items, and Waiting or Answered (icon + word + colour). */
import { CheckCircle2, Hourglass } from "lucide-react";
import { getI18n } from "@/lib/i18n-server";

export interface RequestRow { id: string; when: string; holder: string; items: string[]; answered: boolean; declined?: boolean; flagged: boolean }

export async function RequestCards({ rows }: { rows: RequestRow[] }) {
  const { t } = await getI18n();
  if (rows.length === 0) return <p className="card">{t("recv.requests.none")}</p>;
  return (
    <ul className="cards">
      {rows.map((r) => (
        <li key={r.id} className="card">
          <div className="card-head">
            <p className="big">{t("recv.req.to", { name: r.holder, n: r.items.length })}</p>
            <span className={`chip ${r.declined ? "warn" : r.answered ? "ok" : "unk"}`}>
              {r.answered ? <CheckCircle2 size={18} aria-hidden="true" /> : <Hourglass size={18} aria-hidden="true" />} {t(r.declined ? "recv.req.declined" : r.answered ? "recv.req.answered" : "recv.req.waiting")}
            </span>
          </div>
          <p className="meta">{r.when}</p>
          {r.flagged && <p className="callout warn">{t("recv.req.flagged")}</p>}
        </li>
      ))}
    </ul>
  );
}
