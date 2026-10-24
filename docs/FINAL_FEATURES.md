# UNIVAULT: Final Feature List (supersedes conflicting parts of UNIVAULT_SPEC.md)
Team SPACEX · IMPACTX 2026 · Challenge 02 · Status date: 25 Oct 2026 (updated after Phase 9; per-item evidence in `docs/GAP_AUDIT.md`)

**Positioning line:** *Don't ask for the document. Ask for the answer.*
**One sentence:** Originals are immutable evidence; everything else (corrections, links, requests, shares, kills, erasures) is a signed append-only layer; sharing is purpose-bound, minimal, per-recipient, traceable and killable.

---

## Build status at a glance (25 Oct 2026, after Phase 9)
Source of truth: `docs/GAP_AUDIT.md` (item by item, with file and test evidence) and `HANDOFF.md`.
Gap audit counts: **before Phase 9** 25 done / 28 partial / 13 missing / 1 conflict. **After Phase 9** 53 done / 11 partial / 3 missing / 1 conflict.

| Area | State |
|---|---|
| 0 Invariants | Done (honest-limits text and `<Explain>` on alerts / issuer-change text still partial) |
| 1 Accounts, issuers, authority | Account types, permanent UV-IDs, simulated-verification label, seeded authority JSON enforced server-side: done. Issuer-level suspend: partial. Accounts table and ~5 seeded parties through `ingestDocument()`: not built |
| 2 Vault, verification, matching, readiness | Verification (salted + canonical field hashes, signatures, 8 s / retries, freshness), same-person check, OCR, readiness, affected-share finder: done. PDF-only vault with private bucket: **conflict** (records are structured fields; an upload validator exists but a PDF is not turned into a document). "Verify a copy" box: not built |
| 3 Sharing, requests, kill | Owner share, recipient request (owner can grant less, decline logged), recipient gate, forwarded-link denial, static watermark (stronger on download), stamped-download fingerprint in ledger, eligibility check, kill link / user / all, "Test this link now", neutral receiver notice, leak trace, ledger: done. Details-only default hiding exact values: partial. Preview-pages mode: not built |
| 4 Safety, resilience, privacy | Injection defence, assistant, 5 faults, erase, log-scrub test, threat model, EN/TE policy, a11y evidence, eval (21 scripted cases): done. **Anon-key lock-down needs the owner** (see section 9) |
| Performance | Slow 3G vault target 169 KB / 7.2 s **not met** (about 200 KB / 8.7 s after the Phase 8 role shell) |

Last fully verified run on the live DB (Phase 7): 252 unit, 148 browser tests, axe 0 violations on 21 pages x en/te x normal/A+/high contrast, eval held-out precision 100% / recall 96.6% / 0 false alarms, showcase 17/17, npm audit 0. Phase 8 re-run: 255 unit. Phase 9 final test counts: take from the agent's final report (not recorded here, so not claimed).

---

## 0. Invariants (break one and a judge can break you)
1. **Synthetic only.** Every record `synthetic=true`; persistent banner; issuers labelled SIMULATED ISSUER; identity check, OTP and issuers all labelled simulated. No real Aadhaar/GST/RTO call, ever (brochure bans it).
2. **No hardcoding.** Seed accounts and documents enter via the same `ingestDocument()` path as real ones. Never branch on a name, serial, id or the `synthetic` flag. Expected results live only in labels and test oracles.
3. **Originals immutable.** Corrections, links, requests, shares, kills, erasures are new append-only rows. Tier is computed by verification, never declared by seed data.
4. **Deterministic decisions.** No LLM in verification, readiness, matching, sharing, kill. Document text is data, never instructions.
5. **Server enforces everything.** UI hiding is never a control. Every file/page request re-checks token state, recipient, mode and expiry.
6. **No sensitive value in logs, URLs, analytics.** Use `log()` from `scrub.ts`; automated test proves it.
7. **Neutral wording** for mismatches: "doesn't match the issuer's record in <field>; may be a scanning or typing mistake". Never accuse.
8. **Honest limits shown on screen:** revocation cannot recall copies; watermark traces, cannot stop screenshots; disclosure is an attestation, not zero-knowledge; a UV-ID identifies an account, not a person; "issuer-verified" means the issuer vouches for the record, not that its claims are true.
9. **Every automated output uses the shared `<Explain>` component:** reason, confidence/uncertainty, source + freshness, Correct/Override, Escalate/Dispute (both append-only + ledger).

---

## 1. Accounts, issuers and authority

### 1.1 Account types (all must pass a verification step; the prototype's step is SIMULATED and labelled) — STATUS: PARTIAL (types, UV-ID and simulated label built in `src/lib/accounts.ts`; no accounts table, seeded parties still come from the registry and recipients tables)
| Type | Can issue | Can request | Can own docs |
|---|---|---|---|
| Individual | No (self-attest only) | No | Yes |
| Government | Yes | Yes | Yes |
| Institution (category: college/university OR board/school) | Yes | Yes | Yes |
| Business | Yes | Yes | Yes |

- Every account gets a permanent **UV-ID**. A UV-ID identifies an account, never proves who is at the keyboard (hence the gate in 3.3).
- Claim wording: *"Every account must pass a verification step before it can issue or receive. In this prototype that step is simulated."* Never claim "no fake accounts".
- Demo uses ~5 seeded parties and an **"act as" switcher** (no real login, no onboarding flow).

### 1.2 Issuer authority (seeded JSON: `document type -> allowed issuer category`; adding a type needs no code) — STATUS: DONE (`src/config/issuer-authority.json`, enforced in `issueDocument`); issuer-level suspend PARTIAL
| Issuer category | May issue |
|---|---|
| Government | licence, ID card, passport, income certificate, caste/community certificate, birth/death certificate |
| Institution: college/university | degree, provisional certificate, semester marksheet, enrolment/bonafide |
| Institution: board/school | 9th/10th/12th marksheet and certificate, hall ticket, transfer certificate |
| Business | experience letter, internship certificate, offer letter, relieving letter, salary slip |

- Authority comes **only from the signed registry entry**, never from text inside a PDF.
- Signing a type outside the allowed list -> registry check rejects with a plain reason.
- Issuer revoked/suspended -> every document it issued shows a warning and every active share that used one is listed (see 2.6).
- Not built on purpose: business-to-business/partner documents.

### 1.3 Trust tiers (visual + stored)
| Tier | Meaning |
|---|---|
| Issuer-verified | Pulled from issuer, or signature valid and hash/fields match registry. Shows issuer type. |
| Self-attested | Owner uploaded; no registered issuer. Means "owner claims this", not "this is true". UI: "no registered issuer for this type". |
| User-corrected | Owner's assertion layered over an original, with provenance. |

Rules requiring issuer verification return **unknown** (not fail) for self-attested documents.

---

## 2. Vault, verification, matching, readiness

### 2.1 Vault (F1) — STATUS: CONFLICT (records are structured fields, not PDF files; upload validator built in `src/lib/upload-check.ts`, PDF-to-document pipeline and private bucket not built)
- **PDF only.** Anything else rejected with a plain reason, nothing stored, logged (this is also the "malformed upload" fault).
- Storage bucket: upload allowed, **overwrite and delete denied**. Integrity hash re-checked on every read (cheap).
- Pitch it as "originals can't be edited or deleted", not "secure cloud storage".
- Scanned PDFs: convert pages to images before OCR (OCR does not read PDFs).

### 2.2 Two ways in — STATUS: pull DONE, upload PARTIAL, "Verify a copy" box NOT BUILT
1. **Pull from issuer** (simulated): goes straight to the vault as issuer-verified; fields taken from the issuer record (no OCR); saves serial, version, status, per-field salted hashes.
2. **Upload**: self-attested by default; verified only if it later matches a signed registry entry.
- **"Verify a copy"** box (recipient or owner): same verify code, no new logic.

### 2.3 Verification (F11), three distinct checks
| Check | Compares | When |
|---|---|---|
| Integrity | file hash vs hash stored at ingest | every read from storage |
| Field check | per-field salted hashes vs issuer's | outside copies, or when integrity fails |
| Issuer status | saved version/status vs issuer's current | on **Re-check now**, and **before every share** |

- Hash match = file unchanged, **not** still valid. Always pair with a status check (valid if checked <24h, otherwise ask the issuer for status only).
- Hash mismatch != tampering (re-save/scan changes bytes). On mismatch, fall back to per-field comparison and name the exact field with neutral wording.
- **Canonicalise before hashing** (trim, one date format, normalised unicode) to avoid false flags.
- **Per-field random salt**; registry stores salted hashes only (small values like CGPA are otherwise guessable). Verify `issuer.ts` does this.
- Registry entries are signed (Ed25519); bad signature -> rejected as untrusted.
- Scans can't be verified by file hash; compare confirmed OCR fields, labelled weaker evidence. Visuals (photo/stamp) are not checked on scans; say so.
- Issuer down: 8 s per attempt, retries at 10/30/60/120 s, label "Unverified: issuer unreachable at HH:MM, retrying", manual Retry now. Shares made then carry the label.
- Freshness: data older than 24 h labelled stale and re-verified before any share.
- Change history: per document, a list of events ("new version issued 29 Oct; changed field: CGPA"), old version kept as superseded, no values copied into the timeline.
- **Polling, not push:** one tiny "serial/version/status?" request per document; download only if version changed. A manual "Re-check now" is the demo trigger. No background scheduler required.

### 2.4 Same-person check (F4) (UI name; no "identity percentage")
- Plain-code matcher (initials, honorifics, word order, Telugu<->Latin). Verdict bands: likely same / possible / unlikely, each with reasons ("initial K could stand for Kindinti; same given name").
- **Never auto-merges.** One confirm click covers **one pair of documents**. Stored in `entity_links` as the **owner's claim**; recipients see "linked by owner on <date>", not "verified".
- Ranked best-first across all candidate pairs. Different-person look-alikes must raise no alarm.

### 2.5 Extraction and OCR (F5)
- Extract only fields some rule needs (name, roll number, CGPA/marks, college, course, dates). No electives. Roll number stored, never shared by default.
- Issuer-pulled documents: fields from the issuer record. Scans: OCR with per-field confidence, side-by-side image, fields **unconfirmed** until the owner confirms; corrections are separate assertions; originals and original OCR output never change.
- Metrics: field-level accuracy before/after correction on our generated mixed-script set; confidence calibration table. **Precomputed fixtures as default**, live Tesseract (eng+tel) as a labelled extra.

### 2.6 Readiness (F3), purpose-relative, three-valued
- Rule packs in JSON per recipient (job, scholarship, overseas check). Each rule -> pass / fail / unknown with reason, document used, source "UNIVAULT demo rule pack v1" (not official).
- Predicates: doc_exists, verified, not_expired, name_consistent, scan_confirmed, age_at_least, plus a freshness rule ("issued within N months") where a pack defines one.
- Document status chips (always **icon + text**, never colour alone):
  - Fails recipient's rule now (expired, too old, unverified)
  - Passes now but expires before the deadline / within 30 days
  - Valid through the deadline
  - No expiry (degree, birth certificate)
  - Can't tell (OCR unconfirmed, issuer unreachable)
- Overall: all pass -> ready; any fail -> not ready; else needs confirmation. The old red/yellow/green by 1/2/3 years is **removed** (validity depends on who is asking).
- Affected-share finder (F20): when a record becomes superseded/revoked, list every active share using it and notify the owner.

---

## 3. Sharing, requests, access, kill (ONE pipeline)

**State machines:** Request: `drafted -> sent -> reviewed -> granted | declined | expired`. Share: `drafted -> previewed -> confirmed -> active -> killed | expired`. Token: `issued -> active -> killed | expired`. Verification state is tracked separately.

### 3.1 Initiator can be either side
- **Owner-initiated share:** owner picks recipient (UV-ID), purpose, documents/fields, mode, expiry (max 30 days), optional max views.
- **Recipient-initiated request:** recipient asks for specific documents or criteria with the access it wants ("downloadable", "preview"). **The owner can grant less than asked** (e.g. ask = download, grant = preview or yes/no only). Declining is logged.
- Both flows converge on the same preview -> confirm -> receipt -> token pipeline.

### 3.2 Three modes (server-enforced) — STATUS: Download DONE (stamped fingerprint in ledger); Details-only default PARTIAL (exact values still shown on the owner view); Preview-pages NOT BUILT
| Mode | Recipient gets | Rules |
|---|---|---|
| **Details only (default)** | Attested claims/results (e.g. "CGPA >= 8.0: met, verified") | Exact value hidden unless owner explicitly allows it |
| **Preview** | Rendered, watermarked pages | Raw PDF never served; short-lived page URLs; no download route |
| **Download** | Copy stamped with watermark | Fingerprint of the stamped copy recorded in ledger |
- Upgrading beyond details-only is a deliberate owner choice. Nothing shared before the confirm click; confirmation enforced server-side with a token tied to the preview. Receipt lists fields, recipient, expiry, policy.
- Over-broad detector (F10): purpose -> allowed-fields JSON; excess ask flagged with reason and minimal alternative (e.g. last 4 digits).
- Auto re-verify every included document immediately before sharing. Idempotency key so connectivity loss never creates a duplicate share.

### 3.3 Recipient gate
- Link is **bound to one recipient UV-ID**. Opening requires that identity **plus a one-time code** (simulated, shown on screen, labelled SIMULATED). Only the token's SHA-256 is stored (256-bit random).
- A different verified account using the forwarded link is **denied**, and the log shows "UV-9X12 attempted a link meant for UV-8F21" (verified != intended recipient).
- Every attempt (allowed/denied/killed/expired/wrong ID/code) writes the access log **and** a ledger line.

### 3.4 Watermark (static, not sliding)
- Full-page diagonal tiled, ~8-10% opacity: `UV-ID · share code · time · session`. Stronger on downloads. No Aadhaar/GST/legal name inside it. Honest note: traces, can't stop screenshots.

### 3.5 Eligibility check (F24 = same pipeline, details-only mode) — STATUS: DONE (`src/lib/eligibility.ts`)
- A requester (e.g. scholarship body) sends criteria from a rule pack. The student sees who/why/which criteria/what is disclosed/expiry, and can authorise **per criterion**.
- Results are **met / not met / unknown**; missing, expired, conflicting or unverified evidence = unknown, never "not met". Output is an **attestation signed by UNIVAULT** and must say it is not proof.
- **Consent to evaluate never grants document access.** Documents need a separate request. Recipient must not reach the file by any API or URL.
- Overall status wording: "ready/not ready under these criteria", not "eligible"; the institution decides.

### 3.6 Access log, notifications, kill — STATUS: DONE (device/session kill postponed)
- **One event stream:** the share log shows every event (who UV-ID, what: previewed/downloaded, when, Device 1/Device 2 label, allowed/denied). The bell shows only important events.
- Notify owner on: first open; **every download**; new device; wrong ID/code; unintended account; attempt on a killed/expired link; recipient's request. Not on every view. Text is short and generic ("UV-8F21 opened a document"); no contents.
- Honest labels: device label is a cookie hint, not proof; "previewed" means the server served it.
- **Kill levels (one shared action, reachable from the kill page and from each share-log row):**
  - **Kill link** (main): one share; other shares unaffected.
  - **Kill user:** all shares to one UV-ID.
  - **Kill all:** every active link; new links required.
  - (Device/session kill: postponed; weak because a cookie device returns after the gate.)
- Kill is checked on **every request** (short-lived URLs), recorded as a new event + ledger line; the token is never deleted.
- After a kill: **"Test this link now"** shows it denied (this makes revocation verifiable). Screen states: "Downloaded copies can't be recalled."
- Receiver gets a neutral notice ("Access to <document> was ended by the owner"), no reason given. Owner gets a confirmation and a log line, not a loud alert.
- **Leak trace:** enter watermark text read from a screenshot -> resolves to recipient, session and access events.

### 3.7 Ledger (F7)
- Hash-chained, database-enforced append-only; "Verify ledger" button calls `verify_ledger()`. Include a documented SQL snippet showing an UPDATE being rejected. Every share, request, consent, access attempt, kill, verification, correction and erasure is a line.

---

## 4. Safety, resilience, privacy — STATUS: DONE except the anon-key lock-down (owner action, section 9) and `<Explain>` on alerts
- **Prompt-injection (F13):** detect instruction-like text, zero-width chars, hidden text; document content can never create a share. Deterministic **assistant panel** only *proposes* actions (cards); hidden-text PDF visibly changes nothing. Benign wording ("assistant professor") must not flag; Telugu-language injection must be handled (known baseline gap).
- **Fault panel (F14), 5 defined faults:** issuer timeout; stale data; malformed upload; conflicting update (issuer supersedes during share build -> diff, block confirm until re-reviewed); connectivity loss (draft kept, resumes without duplicate). Judges pick 3 live.
- **Erase flow (F22):** shows limits first (copies can't be recalled; hashes and event times remain; active shares revoked first); deletes payload row and stored file; writes `erased` event + ledger line.
- **Log-scrub test (F16):** automated, zero sensitive values in logs and share URLs; telemetry off; no third-party analytics.
- **Threat model (F17):** top 5 (link forwarding, prompt injection, over-collection, log leakage, OCR trusted as authoritative) with mitigations that exist in code + known limits (anon-key demo mode, screenshots, attestation not ZK, accounts can be shared/stolen, Telugu matching tuned on seeded names).
- **Policy pages (F21), EN + TE:** Rules, Privacy, Deletion & Retention. Every sentence must be true of the code. "Prototype policy, not legal advice."
- **Accessibility (F18):** keyboard-only primary flow, visible focus, ARIA live regions, English + Telugu for vault/readiness/share/kill, light recipient page checked on Slow 3G; axe-core + Playwright evidence.
- **Eval harness (F15):** >=18 scripted cases live + dev/held-out sets: pass rate, detection rate, false alarms, precision/recall, OCR before/after, calibration, metamorphic/property/differential/source-scan results.

---

## 5. Build order (stop wherever time ends; declare the rest "not built")
*Status 25 Oct: steps 1-7 built. Step 8: accessibility and eval done; Slow 3G target not met; Telugu is AI-written and not native-reviewed (`docs/TELUGU_REVIEW.md`). Step 9 (optional): not claimed.*
1. **Share pipeline core:** share/request builder, preview, confirm, receipt, token, recipient gate (UV-ID + simulated OTP), three modes, static watermark, access log + ledger lines.
2. **Kill link / user / all, "Test this link now", notification bell, leak trace.**
3. **Request flow + eligibility check (F24)** on the same pipeline.
4. **Fault panel** (5 faults) + conflicting-update diff.
5. **Injection defence + assistant panel + over-broad detector.**
6. **Issuer authority table + affected-share finder (F20).**
7. **Erase flow, log-scrub test, threat model, policy pages (EN/TE).**
8. **A11y, Telugu, Slow-3G evidence; eval page final run.**
9. *Optional, only if hours remain:* expiry reminders (30 d / 7 d / expiry; only documents with expiry; flag docs expiring before an active share/application deadline; "simulate date" control, no hardcoded demo), live OCR, device-level kill, polished version timeline.

## 6. Cut or postponed (say so in the deck)
- **Cut:** real Aadhaar/GST/RTO calls; "identity percentage"; sliding watermark; business-to-business documents; electives extraction; loud alert for the owner's own kill; "no fake accounts" claim; non-PDF uploads.
- **Postponed:** device-level kill; expiry reminders; designed timeline view; full onboarding; live OCR as default.
- **No longer postponed:** the daily background issuer re-check now exists (Vercel Cron 03:00 UTC, `CRON_SECRET`-guarded; Hobby plan maximum is once a day).

## 7. Sentences we never say
"Secure cloud storage" · "100% true" · "no fake accounts" · "zero-knowledge" · "connected to RTO/DigiLocker/Aadhaar" · "prevents screenshots" · "recalls downloaded copies" · "identity percentage".

---

## 8. Added since this list was written (Phases 7-9)
1. **Three roles with a demo sign-in:** Issuer, Sender (owner), Receiver. Sign-in is simulated: a synthetic Aadhaar-style number (always starts `0000`, Verhoeff check digit), a one-time code shown on screen, and a consent step. Sessions are HMAC-signed cookies holding only the last 4 digits, name and role. Role areas are enforced server-side (issuer `/issuer/**`, receiver `/receive/**`, sender everything else; a receiver can never open the vault). Never described as real Aadhaar or DigiLocker.
2. **Issuer portal:** dashboard, issue wizard, revoke, corrected copy; issuance refused outside the issuer's category.
3. **Receiver area:** inbox, ask for documents (owner can grant less or decline), viewer, report, eligibility requests.
4. **Friendly UI and accessibility controls:** Telugu/English toggle, text size A- / A / A+ (100 / 125 / 150 %), high-contrast mode, Need-help 3-step panel per screen, 20 px base text, bottom tab bar on phones, CSS-only motion that switches off under reduced-motion.
5. **Brand:** logo (blue folder with white padlock) as SVG, palette tokens with contrast tests (`tests/contrast.test.ts`).
6. **Hardening from the Phase 9 audit:** salted per-field fingerprints with canonical values; upload check (magic bytes, size, script content); forwarded-link denial that logs "<UV-ID> attempted a link meant for <UV-ID>"; route/role matrix test; confirm tied to its preview; cookie-tamper tests; source scans (console use, banned wording, accusing words, ledger event coverage); log scrub over the main flows.
7. **Server issuer re-check** on a daily schedule plus rate limits (60/min per IP, 20/min per link; per server instance, stated openly) and a 15-minute lock after 5 wrong codes (derived from the database, so it holds across instances).
8. **Eval:** 21 scripted cases (17 showcase + 4 Phase 9 live cases).

## 9. Honest gaps and owner actions (say these on stage; do not hide them)
- **Public anon key can still read every table until the owner acts.** `npx tsx scripts/anon-probe.ts` showed reads on all 14 tables and erase policies on payloads. Fix: (1) add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and to Vercel (Production and Preview); (2) redeploy with `npx vercel deploy --prod --yes`; (3) run `docs/sql/004_lock_anon.sql` in the Supabase SQL editor; (4) run the probe: every table must say DENIED. Until then the threat model and README say the vault is not private from a direct database query.
- No PDF pipeline, private bucket or preview-pages mode; records are structured details.
- No accounts table; parties are read from the registry and recipients tables.
- Issuer, sign-in, one-time codes and verification of accounts are **simulated**; Ed25519 and SHA-256 are real.
- Selective disclosure is an attestation, not zero-knowledge. Watermarks trace, they do not stop screenshots. Revocation cannot recall copies.
- Rate limits and the sign-in lock are counted per server instance.
- Overrides and disputes are recorded but do not change decisions.
- Telugu text is AI-written, not native-reviewed.
- Slow 3G: 8.7 s / about 200 KB against a 7.2 s / 169 KB target.
- Demo data has test leftovers (about 30 shares, one locked). Reset SQL is in `DEPLOY.md` section 4; run it only right before judging, then `npm run seed`.
