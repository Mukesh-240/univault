/**
 * LOADING — what a page shows while the server is still preparing it: grey shimmering blocks in the shape of the
 * page (a heading, a few cards), so nothing jumps when the real content arrives. It says "Loading" to screen readers.
 * The shimmer is a slow gradient (off for people who ask for less motion).
 */
import { getI18n } from "@/lib/i18n-server";

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div className="skeleton-page" role="status" aria-live="polite">
      <span className="sr-only">{t("loading.sr")}</span>
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="skeleton-grid">
        <div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" />
      </div>
    </div>
  );
}
