"use client";
/**
 * SEAL MOMENT — the "Check with the issuer" signature moment: a scan line sweeps across a little paper, then a seal with
 * a drawn tick stamps on it. It shows for about 2 seconds after a successful check and then goes away.
 * On a laptop the stamp is a spring (motion library, loaded only here); on a phone it is a CSS bounce; with reduced
 * motion nothing is shown at all (the result is already announced and shown as a status chip).
 */
import { useEffect, useRef, useState } from "react";
import { reducedMotion, stampSeal } from "@/lib/motion-effects";

export function SealMoment({ onDone }: { onDone: () => void }) {
  const [gone, setGone] = useState(false);
  const seal = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reducedMotion()) { onDone(); return; }
    const stamp = setTimeout(() => { void stampSeal(seal.current); }, 800);
    const end = setTimeout(() => { setGone(true); onDone(); }, 2600);
    return () => { clearTimeout(stamp); clearTimeout(end); };
  }, [onDone]);
  if (gone || reducedMotion()) return null;
  return (
    <div className="seal-moment" aria-hidden="true">
      <div className="mini-paper"><i /><i /><i /><b className="scan-line" /></div>
      <span ref={seal} className="seal-stamp">
        <svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="5" /><path className="tick" d="M18 33l9 9 19-20" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </div>
  );
}
