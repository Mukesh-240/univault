/**
 * THE APP SHELL — the frame around every page.
 *
 *   - a "Skip to main content" link (first thing a keyboard user reaches);
 *   - the permanent SYNTHETIC DEMO DATA · SIMULATED ISSUER banner (required on every screen), plus a
 *     note when the offline demo store is in use (no database key on this machine);
 *   - the header with the navigation and the English / తెలుగు switch;
 *   - the live region that reads status changes aloud (see components/Live.tsx);
 *   - the owner's notification bell (components/NotificationBell.tsx).
 * In production without a database key, every page shows "Database not configured" instead.
 * The language comes from a cookie, so the server renders the page in the chosen language directly.
 * Telugu text uses the Noto Sans Telugu font (downloaded at build time and served from this app).
 */
import type { ReactNode } from "react";
import { Noto_Sans_Telugu } from "next/font/google";
import { I18nProvider } from "@/components/I18n";
import { LangSwitch } from "@/components/LangSwitch";
import { LiveRegion } from "@/components/Live";
import { NavLinks } from "@/components/NavLinks";
import { NotificationBell } from "@/components/NotificationBell";
import { getI18n } from "@/lib/i18n-server";
import { DB_CONFIGURED, OFFLINE } from "@/lib/supabase";
import en from "@/locales/en.json";
import "./globals.css";

const telugu = Noto_Sans_Telugu({ subsets: ["telugu"], weight: ["400", "600", "700"], variable: "--font-telugu", display: "swap" });

export const metadata = { title: en["app.title"], description: en["app.description"] };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, t } = await getI18n();
  return (
    <html lang={lang} className={telugu.variable}>
      <body>
        <a href="#main" className="skip-link">{t("a11y.skip")}</a>
        {/* role="note": screen readers announce this as supplementary information on every page. */}
        <div role="note" className="banner">
          <strong>{t("banner.synthetic")}</strong> · <strong>{t("banner.simulatedIssuer")}</strong>
          {OFFLINE && <> · <span>{t("banner.offlineStore")}</span></>}
        </div>
        <I18nProvider lang={lang}>
          <header className="site-header">
            <div className="wrap header-inner">
              <a href="/" className="brand">UNIVAULT</a>
              <nav aria-label={t("nav.label")}><NavLinks /></nav>
              <div className="header-tools"><NotificationBell /><LangSwitch /></div>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="wrap">
            {DB_CONFIGURED ? children : (
              // Production without a database key: say so plainly instead of silently using demo memory.
              <section className="panel"><h1>{t("db.notConfigured")}</h1><p>{t("db.notConfiguredBody")}</p></section>
            )}
          </main>
          <footer className="wrap site-footer">
            <p>{t("footer.issuer")}</p>
            <p>{t("footer.attestation")}</p>
          </footer>
          <LiveRegion />
        </I18nProvider>
      </body>
    </html>
  );
}
