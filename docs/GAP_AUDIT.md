# GAP AUDIT: UNIVAULT against docs/FINAL_FEATURES.md

Written at the START of Phase 9 (before any Phase 9 code change) by reading the code and running the app. Statuses:
DONE / PARTIAL / MISSING / CONFLICT. Priorities P0 (loophole) to P3. The "after" counts are at the bottom and are updated at the end of Phase 9.
Evidence is a file path (and the test that proves it where one exists).

## 0. Invariants
| ID | Requirement | Status | Evidence | Fix (priority) |
|---|---|---|---|---|
| 0.1a | Persistent synthetic banner on every page | PARTIAL | Phase 8 replaced it with a DEMO chip (`src/components/DemoChip.tsx`) | Slim persistent strip (P2) |
| 0.1b | Issuers labelled SIMULATED ISSUER wherever shown | PARTIAL | footer text only | Label on issuer areas (P2) |
| 0.2 | No hardcoding, no synthetic-flag branching | DONE | `tests/synth.test.ts` (no dataset value in src) | |
| 0.3 | Originals immutable, tier computed by verification | DONE | `docs/sql/001`, `tests/offline-db.test.ts`, `src/lib/ingest.ts` | |
| 0.4 | No LLM in decisions | DONE | assistant is rule-based (`src/lib/assistant.ts`) | |
| 0.5 | Server enforces everything | PARTIAL | middleware role gate (`tests/signin.test.ts`), token checks in `/s/[token]` | Route-by-route matrix test (P0.1) |
| 0.6 | No sensitive value in logs/URLs | PARTIAL | `tests/scrub.test.ts`, `tests/properties.test.ts` | Source-scan for stray console use (P0.7) |
| 0.7 | Neutral mismatch wording | PARTIAL | `src/lib/issuer.ts` reason text | Wording scan test (P0.9) |
| 0.8 | Honest limits on screen | PARTIAL | footer attestation note, share receipt notes | UV-ID note, anon-key limit (P2) |
| 0.9 | Every automated output uses `<Explain>` | PARTIAL | `Explain` used in vault, doc, names, readiness, share, verify | Audit and add missing (P0.12) |

## 1. Accounts and authority
| ID | Requirement | Status | Evidence | Fix |
|---|---|---|---|---|
| 1.1 | Account types, permanent UV-ID, simulated verification | PARTIAL | profiles from DB (`src/lib/profiles.ts`) have roles, no types or UV-ID | Types + UV-ID + label (P1) |
| 1.1b | About 5 seeded parties via `ingestDocument()` | MISSING | parties come from registry and recipients tables | Not built: needs an accounts table (see HANDOFF) |
| 1.1c | "Act as" switcher | DONE | Phase 8 sign-in chooser | |
| 1.2 | Authority table JSON, registry rejects out-of-category signing | PARTIAL | issuer area offers kinds the issuer used before (`typesFor`) | Seeded JSON table + server check (P2) |
| 1.2b | Revoked/suspended issuer warns on every document | PARTIAL | per-record revoke works; issuer-level suspend missing | P2 |
| 1.3 | Trust tiers shown as stored | PARTIAL | `TierBadge`; wording "self-attested" missing | P2 |

## 2. Vault, verification, matching, readiness
| ID | Requirement | Status | Evidence | Fix |
|---|---|---|---|---|
| 2.1 | PDF-only vault, bucket overwrite/delete denied | CONFLICT | documents are structured fields, no files or bucket | Upload validator now (P0.5); PDF pipeline not built |
| 2.2a | Pull from issuer | DONE | issuer wizard delivers through `ingestDocument` (`tests/issuer-portal.test.ts`) | |
| 2.2b | Upload self-attested | PARTIAL | `/add/file` form | |
| 2.2c | "Verify a copy" box | MISSING | | P3 |
| 2.3-salt | Per-field RANDOM salt in registry | MISSING | `fieldHashes` is `sha256("k=v")`, unsalted | P0.8 |
| 2.3-canon | Canonicalise before hashing | MISSING | trim only | P0.8 |
| 2.3-status | Hash match paired with status check, 24 h freshness | DONE | `src/lib/verify.ts`, `tests/engines.test.ts` | |
| 2.3-mismatch | Mismatch falls back to per-field, names field | DONE | `verifyAgainstIssuer` | |
| 2.3-sig | Bad signature rejected as untrusted | DONE | `tests/issuer.test.ts` | |
| 2.3-scan | Scans: confirmed OCR fields, weaker evidence | DONE | `fieldsToVerify` | |
| 2.3-down | 8 s, retries 10/30/60/120, label, retry now | DONE | `ISSUER_RETRY_DELAYS_MS`, `VerifyPanel` | |
| 2.4 | Same-person check, never auto-merge | DONE | `src/lib/names.ts`, `tests/names.test.ts` | |
| 2.5 | OCR, confirmation, fixtures default | DONE | `src/lib/ocr*.ts` | |
| 2.6 | Readiness three-valued, packs, affected-share finder | DONE | `src/lib/rules.ts`, `recheck.ts`, `tests/recheck.test.ts` | |

## 3. Sharing, requests, access, kill
| ID | Requirement | Status | Evidence | Fix |
|---|---|---|---|---|
| 3.1a | Owner-initiated share | DONE | share wizard | |
| 3.1b | Recipient request, owner grants less | PARTIAL | `/receive/ask`, "Share these" preselects; decline not logged | Decline (P1) |
| 3.2a | Details-only default | PARTIAL | view shows exact values; attestations only for derived items | P1 |
| 3.2b | Preview pages, raw file never served | MISSING | no file pipeline | Not built (no PDFs) |
| 3.2c | Download with stamped fingerprint in ledger | PARTIAL | download route exists; fingerprint not ledgered | P1 |
| 3.2d | Over-broad, auto re-verify, idempotency | DONE | `src/lib/overbroad.ts`, `reverifyAndView`, `tests/shares.test.ts` | |
| 3.2-preview | Confirm tied to preview token | PARTIAL | `src/lib/consent.ts`; no dedicated negative tests | P0.3 |
| 3.3a | Gate: UV-ID + simulated OTP, SHA-256 token | DONE | `/s/[token]`, `hashToken` | |
| 3.3b | Forwarded link: unintended account logged | MISSING | wrong ID logged generically | P0.2 |
| 3.4 | Static diagonal watermark about 9 % | PARTIAL | `src/lib/watermark.ts`; not stronger on downloads | P1 |
| 3.5 | Eligibility check (F24) | MISSING | | P1 |
| 3.6a | One event stream, important-only bell | DONE | `access_log`, `listNotifications` | |
| 3.6b | Kill link / all, test link | DONE | `/api/shares/kill`, `/api/shares/test` | |
| 3.6c | Kill user (all shares to one UV-ID) | MISSING | | P1 |
| 3.6d | Neutral receiver notice on kill | MISSING | receiver sees "stopped by the sender" | P1 |
| 3.6e | Leak trace | DONE | `/leak-trace`, `tests/watermark.test.ts` | |
| 3.7 | Ledger, verify, SQL snippet | PARTIAL | `/ledger` has the snippet; per-event enumeration test missing | P0.10 |

## 4. Safety, resilience, privacy
| ID | Requirement | Status | Evidence | Fix |
|---|---|---|---|---|
| 4.inj | Injection defence, benign wording, Telugu | DONE | `tests/injection.test.ts` | |
| 4.assist | Assistant only proposes cards | DONE | `/assistant` | |
| 4.faults | 5 faults | PARTIAL | `/faults` has issuer down, stale, malformed, conflicting, offline | check wording (P2) |
| 4.erase | Erase flow | DONE | `/api/erase`, e2e journey | |
| 4.scrub | Log-scrub test | PARTIAL | `tests/scrub.test.ts` | source scan (P0.7) |
| 4.threat | Threat model top 5 + limits | PARTIAL | `/threat-model` | add anon-key limit (P0.4) |
| 4.policy | Policy pages EN/TE | DONE | `/policy` | update for new features (P2) |
| 4.a11y | Keyboard, axe, Telugu, Slow 3G | DONE | `e2e/*.e2e.ts` | |
| 4.eval | Eval harness, 18+ live scripted cases | PARTIAL | `npm run eval` (17 live) | P3 |

## Phase 9 P0 probes
| ID | Probe | Status | Fix |
|---|---|---|---|
| P0.1 | Route auth matrix (no session, wrong role, IDOR, dead token) | PARTIAL | matrix test |
| P0.2 | Forwarded link log wording | MISSING | implement + test |
| P0.3 | Confirm without/other preview, duplicate idempotency | PARTIAL | tests |
| P0.4 | Anon key reads what the policies allow | MISSING (limit) | probe + document; full fix needs a service key |
| P0.5 | Upload validation (magic bytes, size, JS, zero bytes) | MISSING | validator + tests |
| P0.6 | Injection handling | DONE | existing tests |
| P0.7 | Log scrub source scan | PARTIAL | scan test |
| P0.8 | Salt + canonicalise | MISSING | implement |
| P0.9 | Wording scan | MISSING | scan test + allowlist |
| P0.10 | Ledger event coverage | PARTIAL | enumeration test |
| P0.11 | Session cookie tamper | PARTIAL | tamper tests |
| P0.12 | `<Explain>` coverage | PARTIAL | audit |

## Counts
BEFORE Phase 9 changes (rows above): DONE 24, PARTIAL 28, MISSING 14, CONFLICT 1 (counted over the tables; P0 probe rows included).
AFTER: see the end of docs/GAP_AUDIT.md once Phase 9 is finished (section "After").
