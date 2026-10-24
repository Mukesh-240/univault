"use client";
/**
 * ERROR — the friendly page when something unexpected breaks: what happened, that nothing was changed, and ONE next
 * step ("Try again"). The technical detail is never shown on screen (it goes to the server log only).
 */
import { useI18n } from "@/components/I18n";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <section className="panel error-card" role="alert">
      <h1>{t("error.title")}</h1>
      <p className="lead">{t("error.body")}</p>
      <button type="button" onClick={reset}>{t("error.retry")}</button>
    </section>
  );
}
