# Deploying UNIVAULT on Vercel

**Live:** https://univault-zeta.vercel.app (project `univault`, deployed 2026-10-24 from the CLI with `npx vercel deploy --prod`).
The GitHub repo is not connected to the Vercel project yet (the Vercel GitHub app has no access to
`Mukesh-240/univault`), so a push does **not** redeploy: run `npx vercel deploy --prod --yes` from the repo root,
or connect the repo under Project Settings → Git. `.vercelignore` keeps `.env*` (except `.env.example`) out of CLI uploads.

This guide imports the GitHub repo into Vercel and connects it to the Supabase project that already holds the seeded demo data. It contains variable **names only**. Secret values never go in this file or in git.

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, for the Production environment. Add them *before* the first deploy: Next.js copies the two `NEXT_PUBLIC_*` values into the build, so a deploy made without them stays "Database not configured" until it is rebuilt.

| Name | Where the value comes from | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL (`https://<ref>.supabase.co`) | No (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API Keys → **publishable** key (`sb_publishable_…`). Never use the secret / service-role key. | No (public; the database rules limit it to read + append) |
| `ISSUER_PRIVATE_KEY` | Your local `.env.local`. It must be the **same** value used for `npm run seed`, because the issuer records in the database were signed with it. | **Yes** |
| `ISSUER_PUBLIC_KEY` | Your local `.env.local` (the matching public half) | No, but keep the pair together |
| `VAULT_PRIVATE_KEY` | Your local `.env.local`. It signs credentials, derives share links and signs download passes. If you change it, links already sent stop working. | **Yes** |
| `VAULT_PUBLIC_KEY` | Your local `.env.local` (the matching public half) | No |
| `NEXT_TELEMETRY_DISABLED` | `1` (turns off Next.js anonymous telemetry) | No |
| `CRON_SECRET` | Any long random string you make up (for example `openssl rand -hex 32`). Vercel Cron sends it as `Authorization: Bearer <value>` to `/api/cron/recheck`; without it that route refuses every call (503). | **Yes** |

**Do not set `UNIVAULT_OFFLINE_DEMO`.** It only exists for local browser tests. Without it, a production deploy that is missing the database key shows "Database not configured" instead of quietly using a temporary in-memory store.

New key pair needed? Generate one with the one-line command in `UNIVAULT_SPEC.md` section 12. A new issuer key means re-seeding a fresh database (see section 4).

## 2. The 5 clicks to import the repo

1. Go to **vercel.com/new**, then under *Import Git Repository* choose **Mukesh-240/univault** and click **Import**.
2. Check that Framework Preset says **Next.js** and Root Directory is **`./`**. Leave Build and Output settings at their defaults.
3. Open **Environment Variables** and add the eight names from the table above.
4. Click **Deploy**. The region is fixed to Mumbai (`bom1`) by `vercel.json`.
5. Open **Settings → Deployment Protection** and make sure Production is **not** behind Vercel Authentication. Recipients open `/s/<link>` without a Vercel account.

## 3. Check it after deploying

- `https://<your-app>.vercel.app/api/health` returns `{"ok":true,"db":"up",...}`. If it says `"db":"down"`, the URL/key variables are missing or wrong: fix them and **redeploy**.
- The vault page lists the synthetic documents, with no "Offline demo store" banner.
- Send the URL back so the smoke test can run (health, vault page, one verify call, one share flow).

## 4. Empty the demo database (owner action)

The live database is append-only, so test runs leave their shares, notifications and erased test documents behind. (The browser tests themselves only erase a throwaway document they upload.) To start the demo from a clean showcase:

1. In **Supabase → SQL Editor**, as the project owner, run the statement below. `TRUNCATE` is an owner-only action: the app's public key cannot do it, and row-level append-only triggers do not apply to it.

   ```sql
   truncate public.access_log, public.token_events, public.share_events, public.share_tokens, public.shares,
            public.entity_links, public.assertions, public.document_events, public.document_payloads,
            public.documents, public.recipients, public.issuer_registry, public.ledger
            restart identity cascade;
   update public.issuer_config set is_down = false, updated_at = now() where id = 1;
   ```

2. Nothing else is needed: the database is now empty. The demo cast (VIT, Government, Mahesh Mekhala, Google) is in `src/config/demo-cast.json`; Google is added to the recipients table by itself on the first sign-in (or run `npm run seed`, which now adds only the cast, never documents). The vault fills only with what VIT or the Government issue, or what the student uploads. (`npm run seed -- --set showcase` still loads the old synthetic dataset, for testing only.)
3. The browser tests no longer touch this database: `playwright.config.ts` starts the test server with `UNIVAULT_FORCE_OFFLINE=1` (the in-memory store).

This step permanently deletes the demo history. Only run it on the demo project.

## What runs where

- Every page and API route runs on the Node.js runtime (`export const runtime = "nodejs"`), because hashing and signing use `node:crypto`.
- Nothing writes to local disk. Everything is stored in Supabase.
- The rule packs and OCR fixtures are bundled with the server functions (`outputFileTracingIncludes` in `next.config.mjs`).
- Security headers (CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`) are set in `next.config.mjs`.
- `src/middleware.ts` refuses POST bodies over 256 KB, and answers 503 "Database not configured" when the database variables are missing.
- Vercel Cron (`vercel.json`) calls `GET /api/cron/recheck` once a day at 03:00 UTC, re-asking the issuer about every document in an active share. Once a day is the most the Hobby plan allows. While the owner has `/shares` open, the page also re-checks every 60 s.

## Phase 7: no new secrets

The simulated sign-in signs its cookies with the existing `VAULT_PRIVATE_KEY`. No new environment variable is needed. Sign-in is demo-only: any valid demo number (starts 0000) is accepted.

## Phase 9: the optional server-only database key

`SUPABASE_SERVICE_ROLE_KEY` (Supabase > Project Settings > API > service_role) is OPTIONAL and is a server secret: never prefix it with NEXT_PUBLIC. When it is set the server uses it instead of the public anon key. To stop the public key reading the tables: (1) add it to `.env.local` and to Vercel (Production and Preview), (2) redeploy, (3) run `docs/sql/004_lock_anon.sql` in the Supabase SQL editor, (4) run `npx tsx scripts/anon-probe.ts`: every table must say DENIED. Do step 3 only after steps 1 and 2.

