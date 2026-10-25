/**
 * LEAK TRACE — a screenshot of a shared page turned up somewhere. Type what you can read in its diagonal
 * watermark; UNIVAULT finds which recipient and which opening (session) it came from.
 */
import { getI18n } from "@/lib/i18n-server";
import { LeakTrace } from "./LeakTrace";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LeakTracePage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHead title={t("leak.title")} purpose={t("leak.intro")} links={[{ href: "/ledger", label: t("nav.ledger") }, { href: "/shares", label: t("nav2.access") }]} />
      <p className="note">{t("preview.watermark")}</p>
      <LeakTrace />
    </>
  );
}
