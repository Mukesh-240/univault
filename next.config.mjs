// Next.js settings.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// SECURITY HEADERS, sent with every page and API answer.
//   Content-Security-Policy  what the browser may load and from where:
//     - only this site, except: the OCR reader (Tesseract.js) fetches its worker, WebAssembly engine and
//       language files from cdn.jsdelivr.net, and the notification bell listens to Supabase Realtime;
//     - 'unsafe-inline' scripts/styles: Next.js puts small inline start-up scripts in every page, and the
//       watermark is an inline style. 'wasm-unsafe-eval' lets the OCR engine run. 'unsafe-eval' only in
//       development (the dev server needs it).
//     - frame-ancestors 'none': no other site may show UNIVAULT inside a frame (clickjacking).
//   X-Frame-Options DENY             the same rule for older browsers.
//   Referrer-Policy no-referrer      never send our addresses (share links contain a secret) to anyone.
//   X-Content-Type-Options nosniff   the browser must trust our declared file types, never guess.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://") ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' https://cdn.jsdelivr.net${supabase ? ` https://${supabase} wss://${supabase}` : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // This folder is the project root (there is an unrelated package-lock.json higher up on this machine).
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Data files the server reads at run time. On Vercel, files in public/ are served by the CDN and are not
  // automatically on the server function's disk, so they are listed here to be bundled with the functions:
  //   src/rules/*.json        the rule packs (read by every page and route that evaluates readiness)
  //   public/ocr/fixtures.json + the scans ground-truth label: the OCR page and its evaluation panel
  outputFileTracingIncludes: {
    "/**": ["./src/rules/*.json"],
    "/ocr": ["./public/ocr/fixtures.json", "./synthetic/out/labels/scans-ground-truth.json"],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
};
