/**
 * MOTION EFFECTS — the few animated moments that need real physics (springs), kept in one place.
 *
 * Plain-English picture: everything else on the site moves with plain CSS. These moments use the small "motion"
 * library (MIT), which is downloaded ONLY when it is needed AND the screen is a laptop-size one (1024px or wider)
 * AND the person has not asked for less movement. On a phone, or with reduced motion, nothing is downloaded and the
 * CSS fallback (or nothing at all) is used, so slow connections stay fast. Only transform, opacity and a glow move.
 */

/** Has the person asked their device for less movement? */
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A laptop-size screen (1024px or wider), where the library is allowed to load. */
export const wideScreen = () => typeof window !== "undefined" && window.matchMedia("(min-width: 64rem)").matches;

/** The motion library, or null on a phone / with reduced motion. */
export async function loadMotion() {
  return wideScreen() && !reducedMotion() ? import("motion") : null;
}

/** A wizard step arriving: its content slides in from the side and the progress bar glows once. */
export async function stepArrives(root: HTMLElement | null, dir: 1 | -1) {
  if (!root || reducedMotion()) return;
  const m = await loadMotion();
  if (!m) {
    // Phones: a short CSS slide, no download.
    root.classList.remove("slide-r", "slide-l");
    void root.offsetWidth;
    root.classList.add(dir > 0 ? "slide-r" : "slide-l");
    return;
  }
  const content = [...root.children].filter((c) => !c.classList.contains("progress")) as HTMLElement[];
  m.animate(content, { opacity: [0, 1], x: [dir * 36, 0] }, { duration: 0.3, ease: "easeOut" });
  const bar = root.querySelector("progress");
  if (bar) m.animate(bar, { boxShadow: ["0 0 0 0 rgba(30,136,254,0)", "0 0 18px 4px rgba(30,136,254,0.65)", "0 0 0 0 rgba(30,136,254,0)"] }, { duration: 0.9 });
}

/** A seal stamping onto paper: it drops from large and a little rotated, and settles with a bounce. */
export async function stampSeal(el: HTMLElement | null) {
  const m = el ? await loadMotion() : null;
  if (!el || !m) return false;
  el.style.animation = "none"; // the CSS version steps aside
  m.animate(el, { scale: [2.6, 1], rotate: [-24, -8], opacity: [0, 1] }, { type: "spring", stiffness: 260, damping: 14 });
  return true;
}

/** Two chain links snapping apart (Stop sharing). Resolves when the animation has finished. */
export async function breakChain(left: Element | null, right: Element | null) {
  const m = left && right ? await loadMotion() : null;
  if (!m || !left || !right) return false;
  await Promise.all([
    m.animate(left, { x: [0, -34], rotate: [0, -18], opacity: [1, 0.55] }, { type: "spring", stiffness: 170, damping: 11 }),
    m.animate(right, { x: [0, 34], rotate: [0, 18], opacity: [1, 0.55] }, { type: "spring", stiffness: 170, damping: 11 }),
  ]);
  return true;
}
