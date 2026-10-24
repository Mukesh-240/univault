/**
 * RECIPIENT PAGES — the plain-HTML screens a recipient sees at /s/<link>.
 *
 * Plain-English picture:
 *   Recipients may be on a slow phone connection, so these pages are small HTML with inline CSS and
 *   NO JavaScript. There are three: the GATE (type your recipient ID and the one-time code), the
 *   DENIED page (the link is dead, or the details were wrong), and the VIEW (only the shared items,
 *   with a diagonal watermark naming the recipient, their code, the time and a session code).
 *   Every value is escaped, so nothing from a document can turn into page code.
 */
import { fieldLabel, translate, type Lang } from "./i18n";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const CSS = `body{margin:0;font:16px/1.6 system-ui,"Nirmala UI","Noto Sans Telugu",sans-serif;color:#0e1a2b;background-color:#f5f1e8}
.b{background:#f4a53b;text-align:center;padding:6px;font-size:14px}.w{max-width:680px;margin:0 auto;padding:16px}
.c{background:rgba(255,253,248,.93);border:1px solid #d8d0bf;border-radius:10px;padding:16px;margin:12px 0}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #d8d0bf;vertical-align:top}
.n{color:#4a5568;font-size:14px}.e{background:#f6dcdc;color:#8f1d1d;border-radius:8px;padding:10px 12px}
label{display:block;font-weight:600;margin-top:10px}input{font:inherit;padding:8px;border:2px solid #24344d;border-radius:6px;min-height:44px;width:100%;box-sizing:border-box}
button{font:inherit;font-weight:600;background:#0e1a2b;color:#fffdf8;border:2px solid #0e1a2b;border-radius:8px;padding:8px 16px;min-height:44px;margin-top:12px}
a{color:#0e1a2b}:focus-visible{outline:3px solid #0e1a2b;outline-offset:2px;box-shadow:0 0 0 6px #f4a53b}`;

/** The page frame: banner + main. `bg` is the watermark (a CSS background image), if any. */
export function page(lang: Lang, title: string, body: string, bg?: string): string {
  const t = (k: string) => esc(translate(lang, k));
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}${bg ? `body{background-image:${bg};background-repeat:repeat}` : ""}</style></head>
<body><div class="b" role="note"><strong>${t("banner.synthetic")}</strong> · <strong>${t("banner.simulatedIssuer")}</strong></div><main class="w">${body}</main></body></html>`;
}

/**
 * The gate, in two steps (both plain forms):
 *   step "send": type your recipient ID, press "Send me a one-time code";
 *   step "open": the code is shown (SIMULATED delivery: no real SMS/email), type it, press "Open".
 * `error` explains a refused attempt without saying which detail was wrong.
 */
export function gateHtml(lang: Lang, action: string, opts: { error?: string; recipientId?: string; sentCode?: string } = {}): string {
  const t = (k: string) => esc(translate(lang, k));
  const err = opts.error ? `<p class="e" role="alert">${esc(opts.error)}</p>` : "";
  const idField = `<label for="rid">${t("gate.recipientId")}</label><input id="rid" name="recipient_id" autocomplete="off" required placeholder="UV-R-0000" value="${esc(opts.recipientId ?? "")}">`;
  const body = opts.sentCode
    ? `<p class="c" role="status"><strong>SIMULATED</strong> · ${t("gate.codeSent")} <strong data-otp>${esc(opts.sentCode)}</strong></p>
<form method="post" action="${esc(action)}" class="c"><input type="hidden" name="step" value="open">${idField}
<label for="code">${t("gate.code")}</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required>
<button type="submit">${t("gate.open")}</button></form>`
    : `<form method="post" action="${esc(action)}" class="c"><input type="hidden" name="step" value="send">${idField}
<p class="n">${t("gate.simulated")}</p><button type="submit">${t("gate.send")}</button></form>`;
  return page(lang, translate(lang, "gate.title"), `<h1>${t("gate.title")}</h1><p>${t("gate.intro")}</p>${err}${body}`);
}

export function deniedHtml(lang: Lang, outcome: string): string {
  const t = (k: string) => esc(translate(lang, k));
  return page(lang, translate(lang, "gate.deniedTitle"), `<h1>${t("gate.deniedTitle")}</h1><p class="e" role="alert">${t(`outcome.${outcome}`)}</p><p class="n">${t("gate.deniedNote")}</p>`);
}

export interface ViewData {
  lang: Lang; recipientName: string; purpose: string; fields: Record<string, string>; attestations: Record<string, boolean>;
  statement: string; verified: { title: string; state: string }[]; expiresAt: string; watermark: string; session: string;
  download?: { action: string; pass: string };
}

/** The recipient's view: only the shared items, watermarked. */
export function viewHtml(v: ViewData, bg: string): string {
  const t = (k: string, vars?: Record<string, string | number>) => esc(translate(v.lang, k, vars));
  const label = (item: string) => esc(fieldLabel(v.lang, item.split(".")[1] ?? item));
  const rows = Object.entries(v.fields).map(([k, val]) => `<tr><th scope="row">${label(k)}</th><td>${esc(val)}</td></tr>`).join("");
  const atts = Object.entries(v.attestations).map(([k, val]) => `<li>${label(k)}: <strong>${t(val ? "preview.yes" : "preview.no")}</strong></li>`).join("");
  const ver = v.verified.map((d) => `<li>${esc(d.title)}: ${t(`state.${d.state}`)}</li>`).join("");
  const dl = v.download ? `<form method="post" action="${esc(v.download.action)}" class="c"><input type="hidden" name="pass" value="${esc(v.download.pass)}">
<p class="n">${t("view.downloadNote")}</p><button type="submit">${t("view.download")}</button></form>` : `<p class="n">${t("view.viewOnly")}</p>`;
  return page(v.lang, translate(v.lang, "view.title"), `<h1>${t("view.title")}</h1>
<p>${t("view.for", { name: v.recipientName, purpose: v.purpose })}</p>
<p class="n" aria-label="${t("view.watermarkLabel")}">${t("view.watermarkIs")}: <span data-watermark>${esc(v.watermark)}</span></p>
<section class="c" aria-labelledby="f"><h2 id="f">${t("preview.fields")}</h2><table><tbody>${rows || `<tr><td>${t("preview.none")}</td></tr>`}</tbody></table></section>
<section class="c" aria-labelledby="a"><h2 id="a">${t("preview.attestations")}</h2><ul>${atts || `<li>${t("preview.none")}</li>`}</ul><p class="n">${esc(v.statement)}</p></section>
<section class="c" aria-labelledby="v"><h2 id="v">${t("view.verified")}</h2><ul>${ver || `<li>${t("preview.none")}</li>`}</ul></section>
${dl}<p class="n">${t("view.expires", { date: v.expiresAt.slice(0, 10) })} · ${t("preview.watermark")} ${t("preview.revocation")}</p>`, bg);
}
