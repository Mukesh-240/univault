/**
 * THE APP SHELL — the frame around every page. The visible parts (top bar, side menu, bottom
 * tabs, "Need help?") live in components/Chrome.tsx; this file works out what the frame needs:
 *   - the language (cookie, or on a first visit the browser's own language: Telugu if it starts with "te");
 *   - the saved text size and High contrast choice (cookies), so the first paint is already right;
 *   - who is signed in, from the signed session cookie (null on the sign-in page and the public pages);
 *   - whether the offline demo store is in use (no database key on this machine).
 * In production without a database key, every page shows "Database not configured" instead.
 * Fonts (one system, all served from this app; next/font downloads them at BUILD time, so a visitor's browser
 * never contacts Google): Inter for the interface, Noto Sans Telugu only on Telugu pages (never preloaded), and
 * JetBrains Mono only for codes and IDs (the browser fetches it only when such text is on screen). next/font also
 * size-matches the fallback font, so the swap does not move the text.
 */
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono, Noto_Sans_Telugu } from "next/font/google";
import { Chrome } from "@/components/Chrome";
import { I18nProvider } from "@/components/I18n";
import { dictForClient } from "@/lib/i18n";
import { LiveRegion } from "@/components/Live";
import { accountInfo } from "@/lib/accounts";
import { currentSession } from "@/lib/auth-server";
import { getI18n } from "@/lib/i18n-server";
import { CONTRAST_COOKIE, parseContrast, parseSize, SIZE_COOKIE } from "@/lib/prefs";
import { DB_CONFIGURED, OFFLINE } from "@/lib/supabase";
import en from "@/locales/en.json";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", adjustFontFallback: true });
const telugu = Noto_Sans_Telugu({ subsets: ["telugu"], weight: ["400", "500", "600"], variable: "--font-telugu", display: "swap", preload: false, adjustFontFallback: true });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-jbmono", display: "swap", preload: false, adjustFontFallback: true });

export const metadata = {
  title: en["app.title"], description: en["app.description"],
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  // The social card and icons are made from the owner's logo by scripts/brand.ts (src/app/icon.png and apple-icon.png are picked up by Next).
  openGraph: { title: "UNIVAULT", description: "Don't ask for the document. Ask for the answer.", images: [{ url: "/brand/og.png", width: 1200, height: 630 }] },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, t } = await getI18n();
  const jar = await cookies();
  const size = parseSize(jar.get(SIZE_COOKIE)?.value);
  const contrast = parseContrast(jar.get(CONTRAST_COOKIE)?.value);
  const session = await currentSession();
  return (
    <html lang={lang} className={lang === "te" ? `${inter.variable} ${mono.variable} ${telugu.variable}` : `${inter.variable} ${mono.variable}`} data-size={size} data-contrast={contrast === "high" ? "high" : undefined}>
      <body>
        <I18nProvider lang={lang} dict={dictForClient(lang)}>
          <Chrome user={session ? { name: session.name, last4: session.last4, role: session.role ?? "sender", uvId: accountInfo(session.role ?? "sender", session.ref ?? "demo").uvId } : null} size={size} contrast={contrast} offline={OFFLINE}>
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
