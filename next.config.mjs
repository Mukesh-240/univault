// Next.js settings.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // This folder is the project root (there is an unrelated package-lock.json higher up on this machine).
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};
