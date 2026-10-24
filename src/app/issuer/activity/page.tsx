/** /issuer/activity — the issuer own recent activity (issued, replaced, stopped), newest first. */
import { currentSession } from "@/lib/auth-server";
import { docTypeLabel, showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { issuerActivity } from "@/lib/issuer-portal";
import { supabase } from "@/lib/supabase";
import { ActivityList } from "../ActivityList";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ActivityPage() {
  const { lang, t } = await getI18n();
  const issuer = (await currentSession())?.ref ?? "";
  const items = await issuerActivity(supabase, issuer, 50);
  return (
    <>
      <h1>{t("nav.issuer.side.activity")}</h1>
      <ActivityList items={items.map((a) => ({ ...a, when: showTime(a.at), type: a.docType ? docTypeLabel(lang, a.docType) : "" }))} />
    </>
  );
}
