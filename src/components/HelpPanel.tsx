"use client";
/**
 * HELP PANEL — the "Need help?" button that is on every screen. It opens a small window with three steps
 * for the screen the person is on, in the current language. It is a real <dialog>: the keyboard stays
 * inside it, Escape or "Close" shuts it, and focus goes back to the button. It never opens by itself.
 * It sits in the top bar, so it can never cover a field or a button. On the first visit it shows the words
 * "Need help?"; after that (remembered in this browser) it shrinks to a "?" icon, still named "Need help?".
 */
import { CircleHelp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { helpScreenFor } from "@/lib/help";
import { useI18n } from "./I18n";

const SEEN = "uv_help_seen";

export function HelpPanel() {
  const { t } = useI18n();
  const screen = helpScreenFor(usePathname());
  const dialog = useRef<HTMLDialogElement>(null);
  const [small, setSmall] = useState(true);
  useEffect(() => {
    try { setSmall(localStorage.getItem(SEEN) === "1"); localStorage.setItem(SEEN, "1"); } catch { setSmall(false); /* storage blocked: keep the words */ }
  }, []);
  return (
    <>
      <button type="button" className={small ? "help-btn small" : "help-btn"} onClick={() => dialog.current?.showModal()}>
        <CircleHelp size={20} aria-hidden="true" /> <span className={small ? "sr-only" : undefined}>{t("ui.help")}</span>
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
