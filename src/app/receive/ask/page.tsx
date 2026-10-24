/**
 * /receive/ask — "Ask for a document": choose the person, tick what is needed, send. The list of things to ask for is
 * every item the rule packs know (grouped by document type); asking for more than the receiver purpose needs is
 * allowed but flagged to the person. Only receivers can send (a sender sees a plain explanation).
 */
import { Send } from "lucide-react";
import { currentSession, receiverCode } from "@/lib/auth-server";
import { getI18n } from "@/lib/i18n-server";
import { loadPacks } from "@/lib/rules";
import { AskForm } from "./AskForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AskPage() {
  const { t } = await getI18n();
  const code = receiverCode(await currentSession());
  if (!code) return <section className="empty-state"><Send size={44} aria-hidden="true" /><h1>{t("recv.noaccount.title")}</h1><p>{t("recv.noaccount.body")}</p></section>;
  const items = [...new Set(loadPacks().flatMap((p) => p.allowed_fields))].sort();
  return (
    <>
      <h1>{t("recv.ask.title")}</h1>
      <AskForm items={items} />
    </>
  );
}
