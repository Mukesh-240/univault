/**
 * The outer frame of every page. For now it only shows the permanent "SYNTHETIC DEMO DATA" banner
 * (required on every screen) — the full app shell, navigation and language switch come in Phase 3.
 */
import type { ReactNode } from "react";
import en from "@/locales/en.json";

export const metadata = { title: en["app.title"], description: en["home.intro"] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {/* role="note": screen readers announce this as supplementary information on every page. */}
        <div role="note" style={{ background: "#7a1f00", color: "#fff", padding: "6px 12px", fontWeight: 700, letterSpacing: 1 }}>
          {en["banner.synthetic"]} · {en["banner.simulatedIssuer"]}
        </div>
        {children}
      </body>
    </html>
  );
}
