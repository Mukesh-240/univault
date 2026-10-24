# UNIVAULT

**A trustworthy document vault prototype** — IMPACTX 2026, Challenge 02 "Your Documents, One Place".

> **Every document, person, issuer and recipient in this project is synthetic.** The issuer is a
> **simulation**: hashes and signatures are real cryptography, but no government or university
> system is connected. The app shows a permanent *SYNTHETIC DEMO DATA · SIMULATED ISSUER* banner.

## What it does

- **Vault with immutable originals.** Each document is stored once with its SHA-256 fingerprint and
  can never be edited. Corrections, name links, verifications and feedback are separate,
  append-only layers. Every card shows its trust tier: **issuer-verified** (solid badge),
  **user-uploaded** (outlined) or **user-corrected** (dashed), always with words as well.
- **Verification against a signed (simulated) issuer registry.** Digital originals are checked by
  whole-file hash and scans field by field. Each attempt waits at most 8 s; automatic retries follow
  at 10/30/60/120 s, then "Retry now". The screen distinguishes altered fields (named exactly, in
  neutral wording), forged signatures, issuer updates, stale results and an unreachable issuer.
- **Readiness per purpose** (job, scholarship, overseas credential check). Each purpose is a
  declarative JSON rule pack, and each rule says pass / fail / unknown with its reason and the
  documents it used. *Demo rules, not official requirements.*
- **Name detective.** Ranked candidate matches across documents (initials, word order,
  Telugu↔Latin spelling), with plain-language reasons. It never merges by itself: a link exists
  only after your Confirm click.
- **OCR** with Tesseract.js (English + Telugu) on generated scans, using either saved results or a
  live in-browser run. Fields stay *unconfirmed* until you confirm or correct them, and a correction
  is a separate assertion. The page also shows field-level accuracy before and after correction,
  and a confidence-calibration table.
- **Assistant** ("Get me ready for…"). It is deterministic and proposes cards only; it cannot share
  or change anything. Instructions hidden inside a document are flagged and ignored.
- **Explain on every automated output.** Each one shows the reason, confidence, source and
  freshness, plus *Correct / Override* and *Escalate / Dispute*. Both actions are recorded as
  hash-chained ledger lines.
- **Fault panel**, with a defined response and recovery for each of: issuer timeout, stale data,
  malformed upload, conflicting issuer update and connectivity loss.
- **English and తెలుగు** throughout the main flow, keyboard-only operation, visible focus, live
  announcements, and a script-free recipient preview page (`/s/preview`) for slow connections.

## Run it

Requires Node.js 20+ (developed on Node 24, Windows 11).

```bash
npm install
cp .env.example .env.local        # then fill in the values (see below)
npm run dev                       # http://localhost:3000
# or a production build:
npm run build && npm start
```

### Environment variables (`.env.local`, never committed)

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key (RLS allows read + append only) |
| `ISSUER_PRIVATE_KEY` / `ISSUER_PUBLIC_KEY` | Ed25519 keys of the *simulated* issuer (server-only) |
| `VAULT_PRIVATE_KEY` / `VAULT_PUBLIC_KEY` | Ed25519 keys UNIVAULT uses to sign attestations and preview tokens (server-only) |
| `NEXT_TELEMETRY_DISABLED=1` | No Next.js telemetry |

Generate the four keys with the script in `UNIVAULT_SPEC.md` §12.

**Offline demo store.** If the anon key is missing or still the `<placeholder>`, the app runs on an
in-memory stand-in for the database (`src/lib/offline-db.ts`). It enforces the same append-only rules
and the same hash-chained ledger, and it is seeded with the showcase dataset through the same
`ingestDocument()` path. The banner then says "Offline demo store", and the data resets on restart.

### Database and seed data

The schema is in `docs/sql/` (001 → 003) and has already been applied to the team's Supabase project.

```bash
npm run synth:all     # regenerate synthetic datasets (dev seed 7, held-out seed 99, showcase seed 2026)
npm run seed          # load the showcase set into Supabase through ingestDocument()
npm run db:check      # schema / ledger sanity check
npm run scans         # regenerate the synthetic scan images (needs a Telugu font, e.g. Nirmala UI)
npm run ocr:fixtures  # re-run Tesseract.js on the scans and save public/ocr/fixtures.json
```

The data card is `docs/DATA_CARD.md`. Labels (expected answers) live only in
`synthetic/out/labels/` and the test oracles; app code never reads them. The only exception is the
OCR page's evaluation panel, which grades results against the ground truth.

## Tests and evaluation

```bash
npm test              # Vitest: unit, oracle-differential, metamorphic, property and anti-hardcoding tests
npm run eval          # detection metrics on the dev and held-out synthetic sets
npm run build && npm run e2e   # Playwright (Microsoft Edge): axe-core scan, keyboard-only walk, Slow 3G, Telugu
```

The e2e results (axe counts per page and Slow 3G timings) are written to `e2e-results/`.

## Libraries and AI tools used

| Library | Version | Licence | Used for |
|---|---|---|---|
| Next.js | 15.5 | MIT | App framework (App Router, route handlers) |
| React / React DOM | 19 | MIT | UI |
| @supabase/supabase-js | 2 | MIT | Database client |
| Zod | 4 | MIT | Input validation at every boundary |
| Tesseract.js (+ `eng`, `tel` tessdata) | 6.0 | Apache-2.0 | OCR of scanned marksheets (browser and fixture script) |
| Noto Sans Telugu (via `next/font`) | — | SIL OFL 1.1 | Telugu typeface, self-hosted at build time |
| sharp | 0.35 | Apache-2.0 | Rendering the synthetic scan images (dev only) |
| Vitest | 5 | MIT | Unit and property tests |
| Playwright (@playwright/test) | 1.64 | Apache-2.0 | Browser tests |
| axe-core + @axe-core/playwright | 4.14 | MPL-2.0 | Automated accessibility checks |
| TypeScript, tsx | 6.0, 4 | Apache-2.0, MIT | Language and script runner |

Node's built-in `crypto` provides SHA-256 and Ed25519. There are no paid APIs, analytics or trackers.

**AI tools:** this code was written with **Claude** (Anthropic), working as a coding assistant under
the team's direction. No AI model runs inside the product: every decision (verification, readiness,
matching, sharing) is deterministic code, and the assistant panel is rule-based.

## Honest limits

- **The issuer is simulated.** No real government, university or DigiLocker integration exists.
- **Selective disclosure is an attestation, not zero-knowledge.** UNIVAULT sees the full data and
  signs a statement such as "over 18 = yes", and the recipient trusts that signature.
- **Revocation cannot recall copies already downloaded**, and a watermark traces a leak but cannot
  prevent screenshots.
- **No real login.** There is one demo vault, and the public anon key can read and append (see the
  threat model in the spec).
- **OCR is imperfect.** On the generated scans, Tesseract misreads letters as digits (for example
  `S` → `5`) with high confidence, which is why every OCR field needs a human confirmation. The
  calibration table on the OCR page shows this.
- **Phase status.** Overrides and disputes are recorded as ledger lines but do not yet change
  decisions. Shares, per-recipient links, revocation and erasure (`/api/share/confirm`) arrive in
  Phase 4. Live-database checks are pending the Supabase anon key on the build machine.
- Engine explanations are generated in English and rendered in Telugu through
  `src/locales/te-reasons.json`. A sentence without a translation is shown in English, marked
  `lang="en"`.
