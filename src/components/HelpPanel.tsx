"use client";
/**
 * HELP PANEL — the "Need help?" button that is on every screen. It opens a small window with three steps
 * for the screen the person is on, in the current language. It is a real <dialog>: the keyboard stays
 * inside it, Escape or "Close" shuts it, and focus goes back to the button. It never opens by itself.
 */
import { CircleHelp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { helpScreenFor } from "@/lib/help";
import { useI18n } from "./I18n";

export function HelpPanel() {
  const { t } = useI18n();
  const screen = helpScreenFor(usePathname());
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="help-fab" onClick={() => dialog.current?.showModal()}>
        <CircleHelp size={24} aria-hidden="true" /> {t("ui.help")}
      </button>
      <dialog ref={dialog} aria-labelledby="help-title">
        <h2 id="help-title">{t(`help.${screen}.title`)}</h2>
        <ol>
          {[1, 2, 3].map((n) => <li key={n}>{t(`help.${screen}.${n}`)}</li>)}
        </ol>
        <div className="dialog-actions">
          <button type="button" onClick={() => dialog.current?.close()} autoFocus>{t("ui.close")}</button>
        </div>
      </dialog>
    </>
  );
}
