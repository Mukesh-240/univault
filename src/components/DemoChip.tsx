"use client";
/**
 * DEMO CHIP — a small "DEMO" label in the top bar on every page. Pressing it opens a short note: all data is
 * synthetic, the sign-in is simulated, no real Aadhaar or government service is used. (On this machine it also says
 * when the in-memory demo store is in use.) Calm on purpose: honest without a big banner.
 */
import { FlaskConical } from "lucide-react";
import { useI18n } from "./I18n";
import { Popover } from "./Popover";

export function DemoChip({ offline = false }: { offline?: boolean }) {
  const { t } = useI18n();
  return (
    <Popover label={<><FlaskConical size={18} aria-hidden="true" /> <span className="demo-chip">{t("demo.chip")}</span></>} panelLabel={t("demo.popTitle")}>
      <h2>{t("demo.popTitle")}</h2>
      <p>{t("demo.popBody")}</p>
      <p className="meta">{t("banner.synthetic")} · {t("banner.simulatedIssuer")}</p>
      {offline && <p className="meta">{t("banner.offlineStore")}</p>}
    </Popover>
  );
}
