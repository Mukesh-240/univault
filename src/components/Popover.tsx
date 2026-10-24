"use client";
/**
 * POPOVER — a button that opens a small panel under it (used for Text size, Alerts and Profile).
 *
 * Plain-English picture: one real button with a word on it. Pressing it opens the panel; pressing it
 * again, pressing Escape, or clicking anywhere else closes it. Escape puts the keyboard focus back on the
 * button. aria-expanded tells screen readers whether the panel is open. No timers: it never closes by itself.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Panel width in rem (the panel never grows wider than the screen minus a 16px margin on each side). */
const PANEL_REM = 24;

interface Props {
  /** What is written on the button (an icon may come first, but always with words). */
  label: ReactNode;
  /** Name of the panel for screen readers. */
  panelLabel: string;
  /** Fixed id for the panel (tests and links can refer to it). */
  panelId?: string;
  /** Called when it opens or closes. */
  onToggle?: (open: boolean) => void;
  /** Extra class on the wrapper (the header hides some tools on phones and shows them in one menu instead). */
  className?: string;
  children: ReactNode;
}

export function Popover({ label, panelLabel, panelId, onToggle, className, children }: Props) {
  const [open, setOpen] = useState(false);
  const auto = useId();
  const id = panelId ?? auto;
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const [pos, setPos] = useState<CSSProperties>({});

  // Where to put the panel: under its button, as far right as the button, but never past either screen edge.
  // (At large text sizes the panel is wide; anchoring it to the button alone pushed half of it off-screen.)
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const margin = 16;
    const width = Math.min(PANEL_REM * rem, window.innerWidth - 2 * margin);
    const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
    const top = rect.bottom + 8;
    setPos({ position: "fixed", left, top, width, right: "auto", maxHeight: `calc(100vh - ${top}px - ${margin}px)` });
  }, [open]);

  const set = (v: boolean) => { setOpen(v); onToggle?.(v); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); onToggle?.(false); button.current?.focus(); } };
    const onClick = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); onToggle?.(false); } };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={className ? `popwrap ${className}` : "popwrap"} ref={wrap}>
      <button type="button" ref={button} aria-expanded={open} aria-controls={open ? id : undefined} className="bell-btn" onClick={() => set(!open)}>{label}</button>
      {open && <div id={id} className="pop bell-panel" role="region" aria-label={panelLabel} style={pos}>{children}</div>}
    </div>
  );
}
