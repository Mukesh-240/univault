# UNIVAULT HANDOFF
Last updated: 2026-10-24 (Phase 6 committed) · Commit: 4b60328 (phase 6) + this handoff commit · Phase: 6 done, LIVE on Vercel

## 1. What this is (3 lines max)
UNIVAULT for IMPACTX 2026 Challenge 02. The promise: "Prove you're ready. Share only what's needed. Take it back."
It is a document vault with immutable originals, a simulated signed issuer registry, readiness rules, and name matching that never auto-merges.
Shares are per-recipient, watermarked and revocable. Every action lands in a hash-chained ledger. Next.js 15 + Supabase. All data is synthetic.

## 2. How to run
```bash
npm install
cp .env.example .env.local      # fill values locally; never commit
npm run dev                     # http://localhost:3000
npm run build && npm start      # production build (refuses the offline store without a DB key)
npx tsc --noEmit                # typecheck
npm test                        # vitest: unit + property + live-DB tests (live ones skip without a real key)
npm run eval                    # precision / recall / false alarms on dev (seed 7) + held-out (seed 99) + showcase
npm run db:check                # live Supabase: issuer_config, append ledger line, verify_ledger(), migration 003
npm run seed                    # load the showcase vault into Supabase (run ONCE per fresh DB)
npx playwright test             # browser tests in Edge (npm run build first); writes e2e-results/axe.json + slow3g.json
npm run screenshots             # README screenshots; app must run on :3400
```
Env var names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ISSUER_PRIVATE_KEY`, `ISSUER_PUBLIC_KEY`,
`VAULT_PRIVATE_KEY`, `VAULT_PUBLIC_KEY`, `NEXT_TELEMETRY_DISABLED`, `CRON_SECRET`. Test-only: `UNIVAULT_OFFLINE_DEMO=1` (never set on Vercel).

## 3. Current state
### Done and verified
- Phases 1–5: vault, readiness, names, verification, OCR, assistant, faults, sharing, leak trace, kill, ledger, erase; live DB verified, hardened, deploy-ready (details in CHANGELOG).
- Phase 6 (2026-10-24):
  - MIT `LICENSE` + README badge; `"license": "MIT"` in package.json.
  - `/threat-model`: 14 rows (incl. new `bruteForce`), each citing real code + test files; `tests/trust-pages.test.ts` checks every cited file exists, every row cites a test, and the stated limits equal the code constants. Telugu headings.
  - `/policy`: 6 sections, Telugu headings, time limits (30 d, 10 min, 5 codes → 15 min lock, 15 min pass, 24 h, 1 year) checked against code constants.
  - Server-side issuer re-check: `src/lib/recheck.ts` shared by POST /api/recheck (page) and GET /api/cron/recheck (Vercel Cron, daily 03:00 UTC in `vercel.json`, Hobby max). `src/lib/cron-auth.ts`: SHA-256 + timingSafeEqual against `Bearer CRON_SECRET`; no secret → 503 for everyone. Tests `tests/recheck.test.ts`: revoked after share → 1 alert, not repeated; unchanged → none; issuer down → unknown, no alert; cron guard.
  - Rate limits: `src/lib/rate-limit.ts`, 60/min per IP and 20/min per link, on `/s/[token]` (GET+POST) and `/s/[token]/download`; 429 + Retry-After + plain en/te message. In-memory PER INSTANCE (stated in README + threat model).
  - Lockout: 5 wrong/reused codes in a row → a `locked` access_log row → 15 min of 429 for every attempt incl. the right code; owner notification `share_locked`. Derived from the DB, so it holds across instances. Tests `tests/lockout.test.ts` + e2e in `e2e/share.e2e.ts`.
  - Perf: Noto Telugu font is now only on Telugu pages, not preloaded, and installed Telugu fonts (Nirmala UI, Kohinoor Telugu) come first. Fixed a `/api/notifications` fetch loop (useI18n returned a new t() each render). English vault on Slow 3G: 12.0 s / 405 KB → 7.2 s / 169 KB, first paint 4.5 s. Telugu vault on the test machine: 7.2 s / 183 KB (system font present).
- Live smoke test (2026-10-24, https://univault-zeta.vercel.app): health 200 db up; vault 200 (11 cards, no offline banner); POST /api/verify 200 verified (signature true); share preview 200 → confirm 201 → gate 200 → code 200 → wrong code 403 → right code 200 watermarked; owner got wrong_code_attempt + first_open for that share; cron without/with wrong secret 401; CSP, XFO DENY, Referrer no-referrer, nosniff, HSTS present; /threat-model 200, /policy 200. Smoke left one active share (purpose = first recipient's org, 1-day expiry) on the live DB.
- Verification run (2026-10-24, live DB): tsc clean; `npm test` 183 passed (20 files, live-DB tests ran); Playwright 37 passed; axe 30 runs (15 pages × en/te) 0 violations; eval dev P 100% / R 97.8% / 0 FA, held-out P 100% / R 96.6% / 0 FA, showcase 17/17; `npm audit` 0; clean build without `.env.local` green.
- Phase 7 (2026-10-24/25): friendly UI + simulated Aadhaar sign-in + motion. Presentation and sign-in only; verification, rules, ledger, share and database logic untouched.
  - Sign-in (`/signin`): 3 big steps (demo number → simulated code on screen → consent with a synthetic record card). `src/lib/synthetic-aadhaar.ts` (12 digits, always 0000…, Verhoeff check digit; numbers starting 2–9 refused). `src/lib/session.ts` (HMAC-SHA256 signed cookies keyed by the existing `VAULT_PRIVATE_KEY`: NO new secret). `uv_session` HttpOnly SameSite=Lax holds only last4 + name; `uv_chal` holds keyed fingerprints of number and code. Code valid 10 min, 5 wrong → 15-min lock (`SIGNIN_LOCK` in rate-limit.ts; counted PER SERVER INSTANCE). Middleware gate (`src/lib/gate.ts`): pages → /signin, APIs → 401; public: /signin, /api/auth/*, /s/*, /api/health, /api/cron/*, /threat-model, /policy.
  - Shell: deep-blue header, language toggle (తెలుగు | English, Telugu default when the browser's first language is te), Text size A-/A/A+ (100/125/150 %, cookie `uv_size`), High contrast (`uv_contrast`), Need-help 3-step panel per screen (`src/lib/help.ts`), 5-tab bottom bar on phones / sidebar on desktop, lucide-react icons, base text 20 px. Palette numbers in `src/lib/palette.ts` (tested in `tests/contrast.test.ts`).
  - Pages restyled: Home (greeting, Am-I-ready cards, tabs, search + status filter), Document, Am I ready?, 4-step share wizard, My shares (confirm dialog), Alerts, More (Stop all sharing), Add a document, Scan and fix, Same person?, ledger/faults/threat/policy, recipient page.
  - Motion (`globals.css` "MOTION" block, pure CSS, no JS, no download cost): page/card rise-in, status-chip pop, floating shield, pulsing Help button, sheen on the simulated code, progress-bar grow, timeline slide, card hover lift, button press, dialog/popover fade. All off under `prefers-reduced-motion`. e2e runs with reducedMotion on so axe measures final colours, not mid-fade ones.
  - Perf: only the chosen language's word list goes to the browser (`src/lib/i18n-core.ts`, `dictFor`), Home first-load JS 145 → 114 kB. Slow 3G vault (English): 7.0 s / 167.5 KB (budget 7.2 s / 169 KB, met); Telugu: 7.25 s / 186.8 KB (slightly over, test machine downloads the Telugu font).
  - Telugu: AI-written, NOT native-reviewed; open phrases in `docs/TELUGU_REVIEW.md`. Parity test fails on a missing key.
  - Screenshots: `docs/screenshots/` (13 screens × 1440/390 × en/te × normal/A+ = 104 PNGs), made by `npm run screenshots`.
  - Deviations: tab label is "Home" (page title "My documents") so five tabs fit at 360 px; /threat-model and /policy are public (readable before sign-in); the synthetic Aadhaar-style document was NOT added to the generator (existing id_card already has a 0000 demo number; eval untouched); the gan-design critique loop was run by me against the rubric (clarity, contrast, touch size, trust, Telugu), not by a separate evaluator agent; the sign-in lock is per server instance; the help toast can overlap the Need-help button at A+ on a phone.
  - Tests: tsc clean; 252 unit (25 files); Playwright 148 (axe 0 violations on 21 pages × en/te × normal/A+/high-contrast; 360 px no sideways scroll at 100 % and 150 %; sign-in en+te; keyboard-only wizard); eval unchanged; npm audit 0.
- Phase 8 (in progress, started 2026-10-25): premium UI, three roles, demo sign-in. Brief = the Phase 8 prompt (tokens + logo + chooser; sender home; issuer; receiver; animation; restyle; screenshots; Telugu review).
  - DONE (priority 1): new palette tokens (`src/lib/palette.ts` + `globals.css`, `tests/contrast.test.ts`); logo as SVG (`src/components/Logo.tsx`, `public/brand/logo.svg`, `src/app/icon.svg`; no logo.png was supplied, the SVG is drawn from the brief's description); glass header, Inter from 1024px up, side menu that folds; sign-in hero with role cards, demo profiles, code pill, consent (`src/app/signin/*`); roles in the session (`role`, `ref` in `src/lib/session.ts`); role guards (`src/lib/gate.ts`, `src/middleware.ts`, `/area` page); profiles read from the DB (`src/lib/profiles.ts`: issuers = registry issuer names, sender = vault owner, receivers = recipients table). DEMO chip replaces the big banner.
  - Role areas: issuer = `/issuer/**` + `/api/issuer-portal/**`; receiver = `/receive/**` + `/api/receive/**`; sender = everything else (may also open `/receive`). A receiver can never open the vault.
  - NOT STARTED: priorities 2-8 (sender home polish, issuer dashboard/wizard/revoke, receiver inbox/ask/viewer, animations, restyle of the rest, screenshots/recordings, README 3-role story, Telugu review additions). Nav entries for `/issuer/*` and `/receive/*` exist in `Chrome.tsx` but the pages do not yet (404 until built).
### Not met / not built
- Slow 3G vault < 6 s to the load event: NOT met (7.2 s). The React+Next runtime is ~102 KB, which is about the floor. (Phase 7 shipped the per-language dictionary; English now 7.0 s / 167.5 KB.) Devices without a Telugu system font also download 124.6 KB of font on Telugu pages.
- Overrides and disputes are recorded but do not change decisions.
- Auto-deploy from GitHub: the Vercel project is not connected to the repo (Vercel GitHub app lacks access). Deploy with `npx vercel deploy --prod --yes`.

## 4. Next 5 actions
1. Wait for the user's go-ahead, then reset the live demo data (`DEPLOY.md` §4, owner SQL), `npm run seed`, `npm run db:check`. Do not run e2e against the live DB afterwards (it creates shares, including one locked share).
2. After the reset, re-run the live smoke test (scratch script pattern: health, vault, verify, share flow with wrong + right code, cron 401, headers, /threat-model, /policy) against https://univault-zeta.vercel.app.
3. Optional: connect the GitHub repo in Vercel (Project Settings → Git) so pushes auto-deploy.
4. Get a native Telugu speaker to review `docs/TELUGU_REVIEW.md` and `src/locales/te.json`.
5. Check the first scheduled cron run (03:00 UTC) in Vercel → Project → Logs (`scheduled recheck done`).

## 5. Decisions made
- 2026-10-24: The offline in-memory store is allowed in dev only, or with `UNIVAULT_OFFLINE_DEMO=1`. Production without a key shows "Database not configured". Reason: never silently fake a DB.
- 2026-10-24: The offline store returns `document_payloads` as one object or null, matching PostgREST for one-to-one embeds. Reason: the faults route broke only on the live DB.
- 2026-10-24: The faults test restores the issuer record (publishes the original value as a new version). The share test erases a throwaway upload. Reason: e2e runs against the live DB must not damage demo data.
- 2026-10-24: Body-size guard is 256 KB, enforced in middleware.
- 2026-10-24 (Phase 6): Rate limiting is in-memory per instance (honestly stated), but the 5-wrong-codes lock is derived from access_log so it is cross-instance. No new table or migration: access_log.outcome is free text. Reason: no new infrastructure for a demo; the security-critical part (code guessing) is DB-backed.
- 2026-10-24 (Phase 6): Cron runs daily, the Vercel Hobby maximum (a more frequent schedule fails the deploy on Hobby). The /shares page still polls every 60 s.
- 2026-10-24 (Phase 6): Each (document, kind) re-check alert is raised once, deduplicated via existing `recheck.affected` ledger lines.
- 2026-10-24: `postcss` override `^8.5.28` to clear the high advisory, instead of jumping to Next 16.
- Phase 4: one-time codes are shown on screen, labelled SIMULATED. Recipient pages are plain HTML with no JS.

## 6. Known problems and workarounds
- **Live demo data has test leftovers.**
  - What's there: about 30 shares (one of them locked by the lockout e2e) and an erased Identity card from an older share-test version.
  - Fix: run the reset SQL in `DEPLOY.md` §4, then `npm run seed`, before judging. Owner action in the Supabase SQL editor.
- **Triggers are never reached with the anon key.**
  - RLS (no UPDATE/DELETE policy) returns 0 rows first. The triggers are a second layer for privileged roles.
  - To see the trigger fire, run the UPDATE snippet on `/ledger` in the SQL editor.
- **Clicks before React hydrates are lost.** E2E tests wait via `go()` in `e2e/journey.e2e.ts`. `networkidle` never fires on the live app because Realtime keeps a connection open.
- **Ending a background `next start` with TaskStop can leave node holding the port.** Kill it by port (`Get-NetTCPConnection -LocalPort N`).
- **Git Bash rewrites a bare `/` argument into a Windows path** (e.g. `node script.mjs /`). Pass paths via env vars.
- **All local e2e requests share one rate-limit bucket** (no x-forwarded-for locally → IP "unknown", 60/min). The current suite stays under it; a much bigger suite may need a higher limit in tests.
- **OCR review hints miss confident misreads.** Recall is 72.5% on held-out. These are by design unconfirmed until a person confirms them.

## 7. Rules that must not break
- Synthetic data is treated exactly like real data.
- No hardcoded expected outputs, no persona/serial/synthetic-flag branching.
- No LLM in decision paths.
- Originals immutable; changes are signed append-only rows; ledger stays hash-chained.
- Never print or commit keys.
- Do not edit `UNIVAULT_SPEC.md` or `UNIVAULT_BUILD_PROMPTS.md`. Do not re-run migration 003. Log only via `log()` in `scrub.ts`.
- Heavy plain-English comments in code.

## 8. Key files map
- `src/lib/db-config.ts`: is a DB configured, and is the offline store allowed? (shared with the middleware)
- `src/lib/supabase.ts`: picks the live client, the offline store (dev/test) or a refusing client.
- `src/lib/offline-db.ts`: in-memory store with the same append-only rules and hash chain.
- `src/middleware.ts`: 256 KB body guard; 503 "Database not configured".
- `src/lib/ingest.ts`: the single front door for every document (Zod schema).
- `src/lib/verify.ts`, `verify-run.ts`, `issuer-service.ts`: issuer check, 8 s timeout, retries.
- `src/lib/recheck.ts`, `cron-auth.ts`, `src/app/api/cron/recheck/route.ts`: issuer re-check (page + scheduled).
- `src/lib/shares.ts`: pure share rules incl. the lock (`wrongCodesSinceReset`, `lockedUntil`). `share-store.ts`: share DB operations. `recipient-html.ts`: recipient pages. `rate-limit.ts`: per-IP/per-link limits.
- `src/lib/trust-pages.ts`: threat-model rows and policy sections (with evidence paths). Pages: `src/app/threat-model`, `src/app/policy`.
- `src/lib/disclosure.ts`: selective disclosure; unconfirmed OCR is withheld.
- `src/lib/ledger.ts`: append/verify. `docs/sql/001-003*.sql`: schema, triggers, RLS.
- `src/lib/i18n.ts` + `src/locales/{en,te}.json`: all UI strings; `components/I18n.tsx`: stable `t()`.
- `eval/harness.ts`, `scripts/eval.ts`: evaluation. `synthetic/`: generators and data.
- `tests/live-db.test.ts`: the live tamper test. `e2e/journey.e2e.ts`: the live journey and faults. `e2e/slow3g.e2e.ts`: perf numbers.
- `next.config.mjs`: security headers and tracing includes. `vercel.json`: region bom1 + daily cron. `DEPLOY.md`: deploy steps.

## 9. External state
- GitHub: https://github.com/Mukesh-240/univault (branch `main`).
- Supabase project ref `opgoukjysnsfzzjnfhxa`. Migrations 001, 002 and 003 are applied (confirmed by `db:check` and the live tests). Seeded once, on 2026-10-24. No new migration in Phase 6.
- Vercel: project `univault` (team `zevel`), linked via `.vercel/` (gitignored). Production URL: https://univault-zeta.vercel.app. 8 env vars set for Production + Preview from `.env.local` (CRON_SECRET generated fresh, stored only in Vercel). `UNIVAULT_OFFLINE_DEMO` not set. Deployment protection is off for the production alias (`/s/test` returns the app's own 403 page).

## 10. Open questions for the user
- Reset the live demo data (`DEPLOY.md` §4) before judging?
- Vercel URL, once imported (remember to set `CRON_SECRET`).
