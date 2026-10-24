"use client";
/** The main navigation. The current page is marked aria-current="page" (read out by screen readers). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18n";

const LINKS = [["/", "nav.vault"], ["/readiness", "nav.readiness"], ["/names", "nav.names"], ["/verify", "nav.verify"],
  ["/ocr", "nav.ocr"], ["/share", "nav.share"], ["/shares", "nav.shares"], ["/leak-trace", "nav.leak"], ["/ledger", "nav.ledger"],
  ["/assistant", "nav.assistant"], ["/faults", "nav.faults"]] as const;

export function NavLinks() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <ul className="nav-links">
      {LINKS.map(([href, key]) => (
        <li key={href}><Link href={href} aria-current={path === href ? "page" : undefined}>{t(key)}</Link></li>
      ))}
    </ul>
  );
}
