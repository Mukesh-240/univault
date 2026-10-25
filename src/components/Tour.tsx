"use client";
/**
 * FIRST-RUN TOUR — four short steps the first time a student signs in: add a document -> check it with the issuer ->
 * share only what is needed -> stop sharing. It is a small panel at the bottom of the screen (it never blocks the
 * page), with the Stepper, "Skip", "Next" and a link to the screen for each step. Dismissing it sets a cookie
 * (uv_tour=done), so it does not come back by itself; "Take the tour" in the avatar menu reopens it.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/session";
import { useI18n } from "./I18n";
import { Stepper } from "./Steps";

const COOKIE = "uv_tour";
const OPEN_EVENT = "uv-tour-open";
const STEPS = [
  { key: "add", href: "/add" }, { key: "check", href: "/verify" }, { key: "share", href: "/share" }, { key: "stop", href: "/shares" },
] as const;

/** Reopen the tour (from Help in the avatar menu). */
export const openTour = () => window.dispatchEvent(new Event(OPEN_EVENT));

export function Tour({ role }: { role: Role }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (role === "sender" && !document.cookie.split("; ").some((c) => c === `${COOKIE}=done`)) setOpen(true);
    const reopen = () => { setI(0); setOpen(true); };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, [role]);
  const close = () => { document.cookie = `${COOKIE}=done; path=/; max-age=31536000; samesite=lax`; setOpen(false); };
  if (!open) return null;
  const s = STEPS[i];
  return (
    <section className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-h">
      <h2 id="tour-h" className="h3">{t("tour.title")}</h2>
      <Stepper steps={STEPS.map((x) => `tour.${x.key}`)} current={i + 1} here={`tour.${s.key}.line`} />
      <div className="row">
        <Link href={s.href} className="btn secondary btn-small" onClick={close}>{t(`tour.${s.key}.go`)}</Link>
        <span className="tour-spacer" />
        <button type="button" className="text" onClick={close}>{t("tour.skip")}</button>
        {i < STEPS.length - 1
          ? <button type="button" className="btn-small" onClick={() => setI(i + 1)}>{t("tour.next")}</button>
          : <button type="button" className="btn-small" onClick={close}>{t("tour.done")}</button>}
      </div>
    </section>
  );
}
