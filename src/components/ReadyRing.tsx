/**
 * READY RING — a progress ring for one "Am I ready?" pack: how many of its checks are done.
 *
 * Plain-English picture: a circle that fills clockwise and a number in the middle that counts up from 0 to the
 * number of checks done ("4" of 7). Both are pure CSS (no script): the ring's end point and the number's end value
 * are written in the style, so with animation switched off (or an old browser) the final picture shows at once.
 * Screen readers get the sentence in `label`, not the animated digits.
 */
import type { CSSProperties } from "react";

const RADIUS = 42;
export const RING_LENGTH = Math.round(2 * Math.PI * RADIUS); // 264

export function ReadyRing({ done, total, label, tone }: { done: number; total: number; label: string; tone: "ok" | "warn" }) {
  const p = total > 0 ? done / total : 0;
  return (
    <div className={`ring ring-${tone}`} role="img" aria-label={label} style={{ "--p": p, "--to": done } as CSSProperties}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ring-bg" cx="50" cy="50" r={RADIUS} />
        <circle className="ring-fg" cx="50" cy="50" r={RADIUS} />
      </svg>
      <span className="ring-num" aria-hidden="true"><span className="count" /><small>/{total}</small></span>
    </div>
  );
}
