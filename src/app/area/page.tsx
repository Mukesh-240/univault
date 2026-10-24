/**
 * /area — "This area is for …". The role guard sends a signed-in person here when they open a page that belongs to
 * another role (an issuer opening the vault, a receiver opening the issuer area...). It says in plain words what
 * happened and offers the one next step: sign in as the right role, or go back to their own home.
 */
import Link from "next/link";
import { currentSession } from "@/lib/auth-server";
import { homeFor } from "@/lib/gate";
import { getI18n } from "@/lib/i18n-server";
import { isRole } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AreaPage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const { t } = await getI18n();
  const wanted = (await searchParams).for;
  const need = isRole(wanted) ? wanted : "sender";
  const session = await currentSession();
  const mine = session?.role ?? "sender";
  return (
    <section className="panel area-card">
      <h1>{t("area.title", { role: t(`area.plural.${need}`) })}</h1>
      <p className="lead">{t("area.body", { mine: t(`area.self.${mine}`), role: t(`signin.role.${need}.tag`) })}</p>
      <div className="row">
        <Link className="btn" href={homeFor(mine)}>{t("area.back")}</Link>
        <SignOutButton label={t("area.switch", { role: t(`signin.role.${need}.tag`) })} />
      </div>
    </section>
  );
}
