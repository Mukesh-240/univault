/**
 * VERIFICATION — check each document that has an issuer serial number with the SIMULATED ISSUER.
 *
 * For each document: the current state (verified / doesn't match / signature check failed /
 * unreachable-retrying / stale / replaced or revoked by the issuer), the exact differing fields in
 * neutral words, and "Verify with issuer" / "Retry now". The server decides; this page displays.
 */
import { VerifyPanel } from "@/components/VerifyPanel";
import { getI18n } from "@/lib/i18n-server";
import { loadDemoVault } from "@/lib/server";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function VerifyPage() {
  const { t } = await getI18n();
  const ctx = await loadDemoVault();
  const withSerial = ctx.docs.filter((d) => d.serial);
  return (
    <>
      <PageHead title={t("verify.title")} purpose={t("verify.intro")} links={[{ href: "/documents", label: t("nav2.docs") }]} />
      <p className="note">{t("verify.simulated")}</p>
      <ul className="cards">
        {withSerial.map((d) => (
          <li key={d.id} id={`v-${d.id}`} className="card">
            <h2 className="h3">{d.title}</h2>
            <p className="meta">{t(`capture.${d.capture}`)} · {t("vault.serial")}: {d.serial}</p>
            <VerifyPanel docId={d.id} title={d.title} initial={ctx.verification[d.id]} />
          </li>
        ))}
      </ul>
    </>
  );
}
