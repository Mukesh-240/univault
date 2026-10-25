/**
 * FAULT PANEL — make things go wrong on purpose and watch UNIVAULT respond (spec F14).
 * Five faults, each with its defined response and how it recovers. The switches themselves live in
 * FaultPanel.tsx; this page only lists the documents that the "conflicting update" fault can target.
 */
import { getI18n } from "@/lib/i18n-server";
import { loadDemoVault } from "@/lib/server";
import { FaultPanel } from "./FaultPanel";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function FaultsPage() {
  const { t } = await getI18n();
  const ctx = await loadDemoVault();
  const docs = ctx.docs.filter((d) => d.serial).map((d) => ({ id: d.id, title: d.title, fields: Object.keys(d.fields) }));
  return (
    <>
      <PageHead title={t("faults.title")} purpose={t("faults.intro")} links={[{ href: "/ledger", label: t("nav2.proof") }]} />
      <FaultPanel docs={docs} />
    </>
  );
}
