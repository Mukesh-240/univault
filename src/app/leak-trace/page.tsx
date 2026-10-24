/**
 * LEAK TRACE — a screenshot of a shared page turned up somewhere. Type what you can read in its diagonal
 * watermark; UNIVAULT finds which recipient and which opening (session) it came from.
 */
import { getI18n } from "@/lib/i18n-server";
import { LeakTrace } from "./LeakTrace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LeakTracePage() {
  const { t } = await getI18n();
  return (
    <>
      <h1>{t("leak.title")}</h1>
      <p className="lead">{t("leak.intro")}</p>
      <p className="note">{t("preview.watermark")}</p>
      <LeakTrace />
    </>
  );
}
