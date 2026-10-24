/**
 * SHARE BUILDER — choose recipient, purpose, items, expiry and policy; see exactly what they will see;
 * confirm; get a receipt. Every share needs this explicit confirmation (nothing else can create one).
 * This page only gathers the choices; the server re-verifies, previews and creates (ShareBuilder.tsx).
 */
import { getI18n } from "@/lib/i18n-server";
import { loadPacks } from "@/lib/rules";
import { loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { ShareBuilder } from "./ShareBuilder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SharePage() {
  const { lang, t } = await getI18n();
  const ctx = await loadDemoVault();
  const packs = loadPacks();
  const rec = await supabase.from("recipients").select("recipient_code, name, org").order("recipient_code");
  const recipients = ((rec.data ?? []) as { recipient_code: string; name: string; org: string }[]).map((r) => ({ code: r.recipient_code, name: r.name, purpose: r.org }));
  // Every item that can be shared: each field of each document type in the vault, plus the derived
  // yes/no or masked items the rule packs allow (e.g. "over 18", "ID number: last 4 digits").
  const items = [...new Set([...ctx.docs.flatMap((d) => Object.keys(d.fields).map((f) => `${d.doc_type}.${f}`)), ...packs.flatMap((p) => p.allowed_fields)])]
    .filter((i) => ctx.docs.some((d) => d.doc_type === i.split(".")[0])).sort();
  return (
    <>
      <h1>{t("share.title")}</h1>
      <p className="lead">{t("share.intro")}</p>
      <ShareBuilder recipients={recipients} items={items}
        packs={packs.map((p) => ({ purpose: p.purpose, title: lang === "te" && p.title_te ? p.title_te : p.title, allowed: p.allowed_fields }))} />
    </>
  );
}
