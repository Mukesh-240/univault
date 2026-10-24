# UNIVAULT Synthetic Data Lab (v0.1)

**Everything here is fictional.** Names are random combinations of generic parts; identity numbers use a fake `0000 xxxx xxxx` pattern; issuers/recipients are invented ("Synthetic State University", ...). Every document carries `synthetic: true` and a `synthetic_origin` (generator, version, seed, recipe, dataset). The app treats these documents exactly like real ones; the flag only drives labels/banners (spec section 16).

## Where things are
| Path | What | Who may read it |
|---|---|---|
| `synthetic/name-bank.json` | generic Latin + Telugu name parts, programs, honorifics | generator |
| `synthetic/generate.ts` | seeded generator (`npm run synth -- --seed 7 --set dev`) | developers |
| `synthetic/out/data/dataset-dev.json` | 697 cases (tune on this) | app ingestion/seed |
| `synthetic/out/data/dataset-heldout.json` | 697 cases, different seed (**report on this, never tune on it**) | app ingestion/seed |
| `synthetic/out/labels/labels-*.json` | ground truth decided **by construction** | **only eval harness and tests. Never the app.** |
| `synthetic/out/coverage-*.md/json` | cases per category x level (min 12 per level) | everyone |

Regenerate: `npm run synth -- --seed 7 --set dev` and `npm run synth -- --seed 99 --set heldout`. Same seed + same `--asof` (default 2026-10-24) => byte-identical output.

## What is covered (58 levels x 12 cases + 1 showcase)
name (10 levels incl. Telugu, typos, similar-but-different persons) · expiry (6 offsets incl. today/-1/-400) · age (5 incl. 17y364d and 18y0d) · tamper (8: one digit, two fields, swapped, extra/missing field, whitespace, homoglyph) · issuer state (7: active, superseded, revoked, unreachable, stale, forged signature, unknown serial) · duplicates (5) · injection (6 incl. zero-width, hidden layer, Telugu, **benign "assistant" wording that must NOT flag**) · over-broad requests (4) · OCR noise (3 with per-field confidence) · date formats (4 incl. Telugu numerals) · plus the `graduate_demo` showcase composed from the same helpers.

## How the app must use it
- Load every document through the single `ingestDocument()` path (same as an upload). Never mark a document issuer-verified from seed data; verification computes that.
- `registry[]` holds the issuer's TRUE record per case. The seed script signs it with the issuer key at load time and applies `behavior` (`forged_signature` = corrupt the signature, `unreachable` = fault, `stale` = old timestamp, `absent` = no entry).
- `label` expectations are for the eval harness only. The app must not import anything from `synthetic/out/labels`.

## Baseline of the DRAFT logic (first run, nothing tuned, informational)
| Check | dev | held-out |
|---|---|---|
| Name: same person flagged as candidate (recall) | 0.98 | 1.00 |
| Name: flagged candidates that are truly same (precision) | 0.92 | 0.98 |
| Name: similar-but-different persons wrongly flagged | 8/12 | 2/12 |
| Telugu-script name matched | 10/12 | 12/12 |
| Injection: visible / zero-width / hidden layer | 12/12 each | 12/12 each |
| Injection: Telugu-language instruction | **0/12** (missed) | **0/12** |
| Injection: benign "assistant professor" wording | **0/12** (false alarm on all) | **0/12** |
These are the first things Phase 2 should fix. Verification, expiry, age, duplicate and over-broad levels are not yet scored because those engines are not built.

## Honest limitations of the lab
- Telugu strings in the bank are hand-written and may be imperfect.
- The over-broad "allowed fields" table in the generator is an oracle copy; the app has its own rule packs. Disagreements must be investigated, not hidden.
- Label conventions (documented in each label's `note`/`convention`): an income certificate is valid *through* its `valid_until` date; a whitespace-only difference is not tampering; turning 18 on the birthday counts as 18.
- Labels are decided by construction and can themselves contain mistakes: if the app disagrees with a label, check the label too.
