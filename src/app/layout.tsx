/**
 * THE APP SHELL — the frame around every page. The visible parts (banner, top bar, side menu, bottom
 * tabs, "Need help?") live in components/Chrome.tsx; this file works out what the frame needs:
 *   - the language (cookie, or on a first visit the browser's own language: Telugu if it starts with "te");
 *   - the saved text size and High contrast choice (cookies), so the first paint is already right;
 *   - who is signed in, from the signed session cookie (null on the sign-in page and the public pages);
 *   - whether the offline demo store is in use (no database key on this machine).
 * In production without a database key, every page shows "Database not configured" instead.
 * Telugu text uses the installed Telugu font when there is one, else Noto Sans Telugu (downloaded at build
 * time, served from this app, and only on Telugu pages, never preloaded).
 */
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Noto_Sans_Telugu } from "next/font/google";
import { Chrome } from "@/components/Chrome";
import { I18nProvider } from "@/components/I18n";
import { dictFor } from "@/lib/i18n";
import { LiveRegion } from "@/components/Live";
import { currentSession } from "@/lib/auth-server";
import { getI18n } from "@/lib/i18n-server";
import { CONTRAST_COOKIE, parseContrast, parseSize, SIZE_COOKIE } from "@/lib/prefs";
import { DB_CONFIGURED, OFFLINE } from "@/lib/supabase";
import en from "@/locales/en.json";
import "./globals.css";

const telugu = Noto_Sans_Telugu({ subsets: ["telugu"], weight: ["400", "600", "700"], variable: "--font-telugu", display: "swap", preload: false });

export const metadata = { title: en["app.title"], description: en["app.description"] };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, t } = await getI18n();
  const jar = await cookies();
  const size = parseSize(jar.get(SIZE_COOKIE)?.value);
  const contrast = parseContrast(jar.get(CONTRAST_COOKIE)?.value);
  const session = await currentSession();
  return (
    <html lang={lang} className={lang === "te" ? telugu.variable : undefined} data-size={size} data-contrast={contrast === "high" ? "high" : undefined}>
      <body>
        <I18nProvider lang={lang} dict={dictFor(lang)}>
          <Chrome user={session ? { name: session.name, last4: session.last4 } : null} size={size} contrast={contrast} offline={OFFLINE}>
            {DB_CONFIGURED ? children : (
              // Production without a database key: say so plainly instead of silently using demo memory.
              <section className="panel"><h1>{t("db.notConfigured")}</h1><p>{t("db.notConfiguredBody")}</p></section>
            )}
          </Chrome>
          <LiveRegion />
        </I18nProvider>
      </body>
    </html>
  );
}
