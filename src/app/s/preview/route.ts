/**
 * GET /s/preview?purpose=scholarship — the LIGHTWEIGHT recipient-style page.
 *
 * Plain-English picture:
 *   A recipient may open their link on a slow phone connection. So the recipient page is plain HTML
 *   with a little inline CSS and NO JavaScript at all: it loads in one small response. This preview
 *   shows exactly what a recipient for that purpose would see if a share were made with the pack's
 *   allowed items (minimal fields + signed yes/no attestations), with the diagonal watermark.
 *   It is a PREVIEW: no share, link or token is created. (Real per-recipient links come in Phase 4.)
 */
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { recipientView } from "@/lib/disclosure";
import { fieldLabel, isLang, LANG_COOKIE, translate, type Lang } from "@/lib/i18n";
import { loadPacks } from "@/lib/rules";
import { log } from "@/lib/scrub";
import { loadDemoVault } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { watermarkBackground } from "@/lib/watermark";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const SESSION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const session = () => Array.from(randomBytes(6), (b) => SESSION_ALPHABET[b % SESSION_ALPHABET.length]).join("");

export async function GET(req: Request) {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(c) ? c : "en";
  const t = (k: string, v?: Record<string, string | number>) => esc(translate(lang, k, v));
  try {
    const packs = loadPacks();
    const want = new URL(req.url).searchParams.get("purpose") ?? packs[0].id;
    const pack = packs.find((p) => p.id === want) ?? packs[0];
    const view = recipientView(await loadDemoVault(), pack.allowed_fields);
    const rec = await supabase.from("recipients").select("name, recipient_code").eq("org", pack.purpose).limit(1);
    const r = (rec.data?.[0] as { name: string; recipient_code: string } | undefined) ?? { name: translate(lang, "preview.someRecipient"), recipient_code: "UV-R-0000" };
    const now = new Date().toISOString();
    const bg = watermarkBackground({ name: r.name, recipientCode: r.recipient_code, time: `${now.slice(0, 10)} ${now.slice(11, 16)} UTC`, session: session() });
    const title = lang === "te" && pack.title_te ? pack.title_te : pack.title;
    const rows = Object.entries(view.fields).map(([k, v]) => `<tr><th scope="row">${esc(fieldLabel(lang, k.split(".")[1] ?? k))}</th><td>${esc(v)}</td></tr>`).join("");
    const atts = Object.entries(view.attestations).map(([k, v]) => `<li>${esc(fieldLabel(lang, k.split(".")[1] ?? k))}: <strong>${t(v ? "preview.yes" : "preview.no")}</strong></li>`).join("");
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t("preview.title")}</title><style>
body{margin:0;font:16px/1.6 system-ui,"Nirmala UI","Noto Sans Telugu",sans-serif;color:#0e1a2b;background:#f5f1e8 ${bg} repeat}
.b{background:#f4a53b;text-align:center;padding:6px;font-size:14px}.w{max-width:680px;margin:0 auto;padding:16px}
.c{background:rgba(255,253,248,.92);border:1px solid #d8d0bf;border-radius:10px;padding:16px;margin:12px 0}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #d8d0bf;vertical-align:top}
.n{color:#4a5568;font-size:14px}a{color:#0e1a2b}a:focus-visible{outline:3px solid #0e1a2b;outline-offset:2px}</style></head>
<body><div class="b" role="note"><strong>${t("banner.synthetic")}</strong> · <strong>${t("banner.simulatedIssuer")}</strong></div>
<main class="w"><h1>${t("preview.heading", { purpose: esc(title) })}</h1>
<p class="c"><strong>${t("preview.notShared")}</strong></p>
<section class="c" aria-labelledby="f"><h2 id="f">${t("preview.fields")}</h2><table><tbody>${rows || `<tr><td>${t("preview.none")}</td></tr>`}</tbody></table></section>
<section class="c" aria-labelledby="a"><h2 id="a">${t("preview.attestations")}</h2><ul>${atts || `<li>${t("preview.none")}</li>`}</ul>
<p class="n">${t("preview.attestationNote")}</p></section>
<section class="c"><h2>${t("preview.limits")}</h2><ul><li>${t("preview.watermark")}</li><li>${t("preview.revocation")}</li><li>${t("footer.issuer")}</li></ul></section>
<p class="n">${t("preview.light")}</p><p><a href="/">${t("preview.back")}</a></p></main></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    log("error", "recipient preview failed", { message: e instanceof Error ? e.message : "unknown" });
    return new Response(`<!doctype html><html lang="${lang}"><title>UNIVAULT</title><p>${t("api.failed")}</p></html>`, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}
