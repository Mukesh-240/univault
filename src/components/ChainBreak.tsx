"use client";
/**
 * CHAIN BREAK — shown over a share card for about a second when sharing is stopped: two chain links snap apart.
 * Decorative only (hidden from screen readers; the result is announced in words). Laptop only: on a phone or with
 * reduced motion the card simply updates.
 */
import { useEffect, useRef } from "react";
import { breakChain } from "@/lib/motion-effects";

export function ChainBreak({ onDone }: { onDone: () => void }) {
  const left = useRef<SVGGElement>(null);
  const right = useRef<SVGGElement>(null);
  useEffect(() => {
    void breakChain(left.current, right.current).then(() => setTimeout(onDone, 350));
    const safety = setTimeout(onDone, 2200);
    return () => clearTimeout(safety);
  }, [onDone]);
  return (
    <div className="chain-break" aria-hidden="true">
      <svg viewBox="0 0 120 50" width="150" height="62">
        <g ref={left}><rect x="8" y="12" width="60" height="26" rx="13" fill="none" stroke="currentColor" strokeWidth="6" /></g>
        <g ref={right}><rect x="52" y="12" width="60" height="26" rx="13" fill="none" stroke="currentColor" strokeWidth="6" /></g>
      </svg>
    </div>
  );
}
