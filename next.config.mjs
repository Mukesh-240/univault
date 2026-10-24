// Next.js settings.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
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
};
