/** /receive/requests — every request this receiver sent, newest first, each Waiting or Answered. */
import { currentSession, receiverCode } from "@/lib/auth-server";
import { showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { personRecord } from "@/lib/person";
import { requestsFor } from "@/lib/receiver-portal";
import { loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { RequestCards } from "../RequestCards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function RequestsPage() {
  const { t } = await getI18n();
  const code = receiverCode(await currentSession());
  const rows = code ? await requestsFor(supabase, code) : [];
  const holder = personRecord((await loadDemoVault()).docs).name ?? "";
  return (
    <>
      <h1>{t("recv.requests.title")}</h1>
      <RequestCards rows={rows.map((r) => ({ ...r, when: showTime(r.at), holder }))} />
    </>
  );
}
