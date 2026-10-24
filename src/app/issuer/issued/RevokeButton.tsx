"use client";
/**
 * REVOKE BUTTON — "Stop this document", after a sentence that says what will happen (the holder will see it as not
 * accepted after their next check; it cannot be undone, but a corrected copy can be issued). Safe choice first.
 */
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmDialog";
import { useI18n } from "@/components/I18n";
import { announce } from "@/components/Live";
import { post } from "@/components/api";

export function RevokeButton({ serial }: { serial: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const stop = async () => {
    const r = await post("/api/issuer-portal/revoke", { serial });
    const m = r.offline ? t("api.offline") : r.ok ? t("issuer.revoke.done") : t("api.failed");
    announce(m);
    if (r.ok) router.refresh();
  };
  return <ConfirmButton label={t("issuer.revoke")} title={t("issuer.revoke.title", { serial })} body={t("issuer.revoke.body")} yes={t("issuer.revoke.yes")} no={t("issuer.revoke.no")} onConfirm={stop} />;
}
