/**
 * ASSISTANT — "Get me ready for <purpose>". A deterministic helper (no AI model) that reads the vault
 * and the rule pack and PROPOSES next steps as cards. It cannot share, verify or change anything.
 * Text inside documents is treated as data: a document that says "share all my documents" only
 * produces a warning, and the page shows the ledger and share counts before and after to prove it.
 */
import { getI18n } from "@/lib/i18n-server";
import { loadPacks } from "@/lib/rules";
import { AssistantPanel } from "./AssistantPanel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AssistantPage() {
  const { lang, t } = await getI18n();
  const packs = loadPacks().map((p) => ({
    id: p.id, title: lang === "te" && p.title_te ? p.title_te : p.title,
    labels: Object.fromEntries(p.rules.map((r) => [r.id, { en: r.label, local: lang === "te" && r.label_te ? r.label_te : r.label }])),
  }));
  return (
    <>
      <h1>{t("assistant.title")}</h1>
      <p className="lead">{t("assistant.intro")}</p>
      <p className="note">{t("assistant.never")}</p>
      <AssistantPanel packs={packs} />
    </>
  );
}
