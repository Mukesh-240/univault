"use client";
/**
 * DISPLAY MENU — "Text size" in the top bar: A-, A, A+ (100%, 125%, 150% of the 20px base text) and a
 * "High contrast" switch. The choice is saved in two small cookies, so it is remembered in this browser
 * and the server draws the next page at that size from the first paint. Changes apply at once.
 */
import { Type } from "lucide-react";
import { useState } from "react";
import { CONTRAST_COOKIE, SIZE_COOKIE, SIZES, type TextSize } from "@/lib/prefs";
import { useI18n } from "./I18n";
import { announce } from "./Live";
import { Popover } from "./Popover";

const YEAR = 31_536_000;
const save = (name: string, value: string) => { document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`; };

export function DisplayMenu({ initialSize, initialContrast }: { initialSize: TextSize; initialContrast: "high" | "normal" }) {
  const { t } = useI18n();
  const [size, setSize] = useState<TextSize>(initialSize);
  const [high, setHigh] = useState(initialContrast === "high");

  const chooseSize = (s: TextSize) => {
    setSize(s);
    document.documentElement.dataset.size = s;
    save(SIZE_COOKIE, s);
    announce(t(`ui.size.${s}.done`));
  };
  const chooseContrast = (on: boolean) => {
    setHigh(on);
    if (on) document.documentElement.dataset.contrast = "high"; else delete document.documentElement.dataset.contrast;
    save(CONTRAST_COOKIE, on ? "high" : "normal");
    announce(t(on ? "ui.contrast.on" : "ui.contrast.off"));
  };

  return (
    <Popover label={<><Type size={22} aria-hidden="true" /> {t("ui.textSize")}</>} panelLabel={t("ui.textSize")}>
      <h2>{t("ui.textSize")}</h2>
      <div role="group" aria-label={t("ui.textSize")} className="size-btns">
        {SIZES.map((s) => (
          <button key={s} type="button" aria-pressed={size === s} className={size === s ? undefined : "secondary"} aria-label={t(`ui.size.${s}`)} onClick={() => chooseSize(s)}>
            {s === "100" ? "A−" : s === "125" ? "A" : "A+"}
          </button>
        ))}
      </div>
      <p className="meta">{t("ui.size.note")}</p>
      <label className="toggle" htmlFor="hc-toggle">
        <input id="hc-toggle" type="checkbox" checked={high} onChange={(e) => chooseContrast(e.target.checked)} /> {t("ui.highContrast")}
      </label>
    </Popover>
  );
}
