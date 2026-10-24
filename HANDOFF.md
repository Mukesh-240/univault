# UNIVAULT HANDOFF
Last updated: 2026-10-24 18:41 IST · Commit: 793cc6a · Phase: 5 (done; waiting for the Vercel URL)

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
npx playwright test             # browser tests in Edge (builds must exist: npm run build first)
npm run screenshots             # README screenshots; app must run on :3400
```
Env var names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ISSUER_PRIVATE_KEY`, `ISSUER_PUBLIC_KEY`,
`VAULT_PRIVATE_KEY`, `VAULT_PUBLIC_KEY`, `NEXT_TELEMETRY_DISABLED`. Test-only: `UNIVAULT_OFFLINE_DEMO=1` (never set on Vercel).

## 3. Current state
### Done and verified
- Phases 1–4: vault, readiness, names, verification, OCR, assistant, faults, sharing, leak trace, kill, ledger, erase.
- Phase 5 Step 1, live DB (2026-10-24):
  - `npm run db:check` passes.
  - Seed loaded 11 documents, 7 registry entries and 3 recipients. Ledger verified after seeding.
  - Live tamper test (`tests/live-db.test.ts`): a ledger line is appended, then UPDATE and DELETE are tried on 13 protected tables. All are refused and the rows are unchanged; `verify_ledger` returns ok:true with broken_at null.
  - Latest `db:check`: verify_ledger ok, 580 lines.
  - `/api/health` against the live DB returns `db:"up"`.
- Phase 5 Step 2, all on the live DB:
  - `tsc` is clean. `npm test`: 168 passed (17 files).
  - Playwright: 32 passed, including the new `e2e/journey.e2e.ts` (manual-style journey + every fault on/off).
  - axe: 26 runs (13 pages × en/te), 0 violations at any level.
  - Eval, held-out: precision 100%, recall 96.6%, 0 false alarms; misses are 19 OCR plus 1 Telugu-script name. Dev: 100% / 97.8% / 0. Showcase: 17/17.
  - Slow 3G: recipient preview 2.1 s, 3.4 KB, 0 scripts. Vault 12.0 s, 405 KB.
- Phase 5 Step 3, security:
  - No secrets in the repo or history; only `.env.example` is tracked.
  - CSP, X-Frame-Options, Referrer-Policy and nosniff are set in `next.config.mjs`.
  - `src/middleware.ts` refuses POST bodies over 256 KB (413) or without a length (411).
  - The recipient form is now validated with Zod.
  - `npm audit`: 0 vulnerabilities, via a postcss override.
  - Tesseract runs under the CSP with 0 violations.
- Phase 5 Step 4, Vercel readiness:
  - A clean build with no `.env.local` is green.
  - With no key in production: pages show "Database not configured", APIs and `/s/*` return 503, and health returns 503 with `db:"down"`.
  - `DEPLOY.md` is written.
### In progress
- Nothing. Phase 5 is committed (793cc6a). README.md is rewritten with the live numbers; "Live demo" reads `[VERCEL URL TO BE ADDED]`.
### Not started
- Vercel deploy (the user imports it) and the smoke test against the URL.
- Threat-model page (F17) and policy pages (F21).
- Overrides and disputes changing decisions (today they are only recorded).
- A server-side cron for the issuer re-check.

## 4. Next 5 actions
1. Wait for the user to import the repo on Vercel (`DEPLOY.md`) and send the URL.
2. Smoke test the URL: `/api/health` (expect `db:"up"`), the vault page, one `POST /api/verify`, and one share flow (preview → confirm → `/s/<token>` gate → code → open → kill). Report any failures.
3. Replace `[VERCEL URL TO BE ADDED]` in README.md with the URL. Commit "docs: live demo URL", push, and update CHANGELOG + this file.
4. If the user agrees: reset the live demo data (`DEPLOY.md` §4, owner SQL), then `npm run seed` and `npm run db:check`. Do not run e2e against the live DB afterwards.
5. Next feature work, if asked: the threat-model page (F17) and policy pages (F21), then a server-side issuer re-check.

## 5. Decisions made
- 2026-10-24: The offline in-memory store is allowed in dev only, or with `UNIVAULT_OFFLINE_DEMO=1`. Production without a key shows "Database not configured". Reason: never silently fake a DB.
- 2026-10-24: The offline store returns `document_payloads` as one object or null, matching PostgREST for one-to-one embeds. Reason: the faults route broke only on the live DB.
- 2026-10-24: The faults test restores the issuer record (publishes the original value as a new version). The share test erases a throwaway upload. Reason: e2e runs against the live DB must not damage demo data.
- 2026-10-24: Body-size guard is 256 KB, enforced in middleware. There is no rate limiter: in-memory limits are unreliable on serverless.
- 2026-10-24: `postcss` override `^8.5.28` to clear the high advisory, instead of jumping to Next 16.
- Phase 4: one-time codes are shown on screen, labelled SIMULATED. Recipient pages are plain HTML with no JS.

## 6. Known problems and workarounds
- **Live demo data has test leftovers.**
  - What's there: about 24 shares and an erased Identity card. The Identity card was erased by an older share-test version.
  - Fix: run the reset SQL in `DEPLOY.md` §4, then `npm run seed`, before judging. Owner action in the Supabase SQL editor.
- **Triggers are never reached with the anon key.**
  - RLS (no UPDATE/DELETE policy) returns 0 rows first. The triggers are a second layer for privileged roles.
  - To see the trigger fire, run the UPDATE snippet on `/ledger` in the SQL editor.
- **Clicks before React hydrates are lost.** E2E tests wait via `go()` in `e2e/journey.e2e.ts`. `networkidle` never fires on the live app because Realtime keeps a connection open.
- **Ending a background `next start` with TaskStop can leave node holding the port.** Kill it by port (`Get-NetTCPConnection -LocalPort N`).
- **Vault page on Slow 3G takes 12 s** (405 KB JS). Recipient pages are light.
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
- `src/lib/shares.ts`: pure share rules. `share-store.ts`: share DB operations. `recipient-html.ts`: recipient pages.
- `src/lib/disclosure.ts`: selective disclosure; unconfirmed OCR is withheld.
- `src/lib/ledger.ts`: append/verify. `docs/sql/001-003*.sql`: schema, triggers, RLS.
- `src/lib/i18n.ts` + `src/locales/{en,te}.json`: all UI strings; `itemLabel` = "Doc type · Field".
- `eval/harness.ts`, `scripts/eval.ts`: evaluation. `synthetic/`: generators and data.
- `tests/live-db.test.ts`: the live tamper test. `e2e/journey.e2e.ts`: the live journey and faults.
- `next.config.mjs`: security headers and tracing includes. `vercel.json`: region bom1. `DEPLOY.md`: deploy steps.

## 9. External state
- GitHub: https://github.com/Mukesh-240/univault (branch `main`).
- Supabase project ref `opgoukjysnsfzzjnfhxa`. Migrations 001, 002 and 003 are applied (confirmed by `db:check` and the live tests). Seeded once, on 2026-10-24.
- Vercel: not yet imported. URL: none yet.

## 10. Open questions for the user
- Reset the live demo data (`DEPLOY.md` §4) before judging?
- Which licence should the repo use? The README badge still says TBD.
