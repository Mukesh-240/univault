"use client";
/**
 * INTER LOADER — turns the Inter font on for laptop-size screens, but only AFTER the page has finished loading.
 * Plain English: the page is readable at once in the device's own font; a moment after it is ready (and only on a
 * screen 1024px or wider) the Inter font is downloaded and swapped in. Phones never download it. The fallback font is
 * size-matched by next/font, so the swap barely moves anything. This keeps the first load small on slow connections.
 */
import { useEffect } from "react";
import { afterLoad } from "@/lib/after-load";
import { wideScreen } from "@/lib/motion-effects";

export function InterLoader() {
  useEffect(() => {
    if (!wideScreen()) return;
    return afterLoad(() => document.documentElement.classList.add("inter-on"), 600);
  }, []);
  return null;
}
