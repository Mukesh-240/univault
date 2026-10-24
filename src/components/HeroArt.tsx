"use client";
/**
 * HERO ART — the animated logo on the sign-in page, with a very small parallax: it drifts a few pixels toward the
 * mouse on laptops. It only listens on screens 1024px or wider, never when the person asked for less movement, and
 * moves nothing but a transform. (Hero only: no other page uses parallax.)
 */
import { useEffect, useRef } from "react";
import { reducedMotion, wideScreen } from "@/lib/motion-effects";
import { Logo } from "./Logo";

export function HeroArt() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !wideScreen() || reducedMotion()) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--px", String(((e.clientX / window.innerWidth) - 0.5).toFixed(3)));
        el.style.setProperty("--py", String(((e.clientY / window.innerHeight) - 0.5).toFixed(3)));
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(frame); };
  }, []);
  return (
    <div className="signin-art" aria-hidden="true" ref={box}>
      <div className="art-glow" />
      <div className="art-logo"><Logo size={192} /></div>
    </div>
  );
}
