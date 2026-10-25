/**
 * /issuer/issue — the issue wizard. With ?correct=<serial> it starts a CORRECTED COPY of one of this issuer own
 * records (the kind is already known, and the old record is marked replaced when the new one is signed).
 */
import { currentSession } from "@/lib/auth-server";
import { getI18n } from "@/lib/i18n-server";
import { latestEntry, typesFor } from "@/lib/issuer-portal";
import { supabase } from "@/lib/supabase";
import { IssueWizard } from "./IssueWizard";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function IssuePage({ searchParams }: { searchParams: Promise<{ correct?: string }> }) {
  const { t } = await getI18n();
  const session = await currentSession();
  const issuer = session?.ref ?? "";
  const correct = (await searchParams).correct;
  let supersedes: { serial: string; docType: string } | null = null;
  if (correct) {
    const e = await latestEntry(supabase, correct.slice(0, 80));
    if (e && e.issuer_name === issuer && e.status === "active") supersedes = { serial: e.serial, docType: e.doc_type };
  }
  return (
    <>
      <PageHead title={t("issuer.btn.issue")} purpose={t("p11.purpose.issue")} />
      <IssueWizard issuerName={issuer} types={await typesFor(supabase, issuer)} supersedes={supersedes} />
    </>
  );
}
