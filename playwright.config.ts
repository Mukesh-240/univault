/**
 * PLAYWRIGHT — browser tests (accessibility scan, keyboard-only walk, slow network, Telugu switch, sign-in).
 * Run: npm run build && npm run e2e
 *
 * It starts the built app on port 3100 and drives Microsoft Edge (already installed on Windows, so
 * no browser download is needed). With no database key the app uses its offline demo store, which
 * starts fresh each run. Tests run one after another because they share that one server.
 * Every test starts signed in (e2e/global-setup.ts saves a session cookie); the sign-in tests start signed out.
 * Results (axe counts, timings) are written to e2e-results/ for the report.
 */
import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.e2e\.ts/,
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: [["list"]],
  outputDir: "e2e-results/artifacts",
  globalSetup: "./e2e/global-setup.ts",
  retries: 1, // one retry for timing-sensitive journeys on a cold server (a real failure fails twice)
  use: { baseURL: `http://localhost:${PORT}`, channel: "msedge", headless: true, reducedMotion: "reduce", storageState: "e2e-results/auth.json" },
  // UNIVAULT_OFFLINE_DEMO=1: the explicit opt-in that lets a production build use the offline demo store
  // for these local tests (without it, a production build with no database key shows "Database not configured").
  webServer: { command: `npm run start -- -p ${PORT}`, url: `http://localhost:${PORT}/api/health`, timeout: 120_000, reuseExistingServer: false, env: { UNIVAULT_OFFLINE_DEMO: "1", UNIVAULT_FORCE_OFFLINE: "1" } },
});
