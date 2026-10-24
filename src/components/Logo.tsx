/**
 * LOGO — the UNIVAULT mark: a bright-blue folder with two papers peeking out and a white padlock with a navy keyhole.
 *
 * Plain-English picture: a drawing (SVG), not a picture file, so it stays sharp at any size and in any text size.
 * `animated` makes the folder float, the papers slide up and the padlock snap shut once with one blue pulse (CSS in
 * globals.css, switched off for people who ask for less motion). It is decorative next to the word UNIVAULT, so it
 * hides itself from screen readers unless it stands alone (`label`).
 */
export function Logo({ size = 32, animated = false, label }: { size?: number; animated?: boolean; label?: string }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} className={animated ? "logo logo-anim" : "logo"} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })} focusable="false">
      <defs>
      <linearGradient id="lgFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#46A6FF"/><stop offset="1" stopColor="#1572E6"/></linearGradient>
      <linearGradient id="lgBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8CC8FF"/><stop offset="1" stopColor="#5AA9F5"/></linearGradient>
      </defs>
      <path className="lg-back" d="M24 70Q24 54 40 54H92Q100 54 106 62L114 74H216Q232 74 232 90V196Q232 214 214 214H42Q24 214 24 196Z" fill="url(#lgBack)"/>
      <g className="lg-paper1"><g transform="rotate(-6 100 100)"><rect x="50" y="38" width="98" height="122" rx="9" fill="#FFFFFF" stroke="#BFD9FA" strokeWidth="2"/><g stroke="#9CC7FB" strokeWidth="5" strokeLinecap="round"><path d="M66 62H132M66 78H132M66 94H112"/></g></g></g>
      <g className="lg-paper2"><g transform="rotate(5 144 94)"><rect x="96" y="30" width="98" height="122" rx="9" fill="#FFFFFF" stroke="#BFD9FA" strokeWidth="2"/><g stroke="#9CC7FB" strokeWidth="5" strokeLinecap="round"><path d="M112 54H178M112 70H178M112 86H158"/></g></g></g>
      <path className="lg-front" d="M24 106Q24 90 40 90H216Q232 90 232 106V196Q232 214 214 214H42Q24 214 24 196Z" fill="url(#lgFront)"/>
      <g className="lg-lock"><path className="lg-shackle" d="M104 142V128a24 24 0 0 1 48 0V142" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round"/><rect x="92" y="138" width="72" height="54" rx="12" fill="#FFFFFF"/><circle cx="128" cy="160" r="7.5" fill="#0B3A8C"/><rect x="124.5" y="162" width="7" height="15" rx="3.5" fill="#0B3A8C"/></g>
    </svg>
  );
}
