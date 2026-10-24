/** /issuer/more — links to what this demo stores and defends against; sign-out and display settings are in the top bar. */
import Link from "next/link";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function IssuerMore() {
  const { t } = await getI18n();
  return (
    <>
      <h1>{t("issuer.more.title")}</h1>
      <p className="lead">{t("issuer.more.note")}</p>
      <ul className="cardlist">
        <li className="card"><Link href="/policy">{t("footer.policy")}</Link></li>
        <li className="card"><Link href="/threat-model">{t("footer.threatModel")}</Link></li>
      </ul>
    </>
  );
}
