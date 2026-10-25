/**
 * PAGE HEAD — the same top on every signed-in page: the title, ONE plain sentence saying what the page is for, and
 * at most one primary action on the right. Optional `links` are small quiet links under the sentence (the related
 * tools that live inside this page, e.g. "Scan and fix" and "Same person" under My documents).
 */
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHead({ title, purpose, action, links }: { title: string; purpose: string; action?: { href: string; label: string; icon?: ReactNode }; links?: { href: string; label: string }[] }) {
  return (
    <header className="page-head2">
      <div className="page-head2-txt">
        <h1>{title}</h1>
        <p className="page-purpose">{purpose}</p>
        {links && links.length > 0 && (
          <nav className="page-links" aria-label={title}>{links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</nav>
        )}
      </div>
      {action && <Link href={action.href} className="btn">{action.icon}{action.label}</Link>}
    </header>
  );
}
