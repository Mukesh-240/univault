"use client";
/**
 * LIVE REGION — the one place status changes are announced ("Recorded", "Verified", "Offline").
 *
 * Plain-English picture:
 *   Screen readers do not notice text that silently changes somewhere on a page. A "live region" is a
 *   box the screen reader watches and reads aloud whenever its text changes. announce("...") puts a
 *   message there (and shows it as a small visible toast for sighted users too).
 */
import { useEffect, useState } from "react";

const EVENT = "uv-announce";
const SHOW_MS = 8000;

/** Say something to the person (polite: waits until the screen reader is quiet). */
export function announce(message: string): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function LiveRegion() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      // Clear first so the same message twice is still announced twice.
      setMsg("");
      setTimeout(() => setMsg((e as CustomEvent<string>).detail), 30);
      clearTimeout(hide);
      hide = setTimeout(() => setMsg(""), SHOW_MS);
    };
    window.addEventListener(EVENT, on);
    return () => { window.removeEventListener(EVENT, on); clearTimeout(hide); };
  }, []);
  return <div id="live-region" role="status" aria-live="polite" aria-atomic="true" className={msg ? "toast" : "toast toast-empty"}>{msg}</div>;
}
