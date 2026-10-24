# UNIVAULT — Product Spec, Feature List & Feasibility
*IMPACTX 2026 · Challenge 02 "Your Documents, One Place" (Hard Mode) · Team of 4 · Stack: Next.js + Supabase*

> **Update 25 Oct 2026.** `docs/FINAL_FEATURES.md` supersedes any conflict with this file. Section 0 below is the current state after Phase 9; sections 1-12 are the original plan and are annotated where reality differs.
>
> **How to use this file.** It is written to be understood with **no other context**. Hand it to a teammate, or paste it into Claude Code (Antigravity) as the project brief. Section 12 is a ready-made instruction block for the coding agent.

---

## 0. Status snapshot (25 Oct 2026, after Phase 9)

| Item | State |
|---|---|
| Live app | https://univault-zeta.vercel.app (Vercel project `univault`; GitHub is not connected, deploy with `npx vercel deploy --prod --yes`). Repo: https://github.com/Mukesh-240/univault (public, MIT) |
| Supabase `opgoukjysnsfzzjnfhxa` (ap-south-1) | Migrations 001-003 applied and tested. `docs/sql/004_lock_anon.sql` written, **not yet run (owner action)** |
| Append-only protection + hash-chained ledger | Done in the database: 12 triggers on 11 tables reject UPDATE/DELETE; `verify_ledger()` checks the chain |
| Phases 1-6 | Done and deployed: signing, mock issuer, verify flow, trust tiers, readiness, Telugu-aware name matching, OCR correction, selective disclosure attestation, per-recipient shares, watermark, kill, leak trace, fault panel, erase, threat model, policy pages (EN/TE), daily re-check cron, rate limits and code lockout |
| Phase 7 | Friendly UI, simulated sign-in with synthetic Aadhaar-style numbers (`0000...`), text-size and high-contrast controls, motion |
| Phase 8 | Premium UI, logo and palette tokens, three roles (Issuer / Sender / Receiver) with demo profiles and server-enforced role areas. Not finished: README three-role story, screenshots re-run, design scores in `docs/DESIGN.md` |
| Phase 9 | Gap audit against FINAL_FEATURES (25/28/13/1 before, 53/11/3/1 after, `docs/GAP_AUDIT.md`); loophole fixes with regression tests; account types and UV-IDs; issuer authority; eligibility check; decline; kill user |
| Tests (last full live run, Phase 7) | 252 unit, 148 browser, axe 0 violations, eval held-out P 100% / R 96.6% / 0 false alarms, showcase 17/17, npm audit 0. Phase 8: 255 unit. Phase 9 final counts: from the agent's final report |
| Not met / not built | Slow 3G target (8.7 s / about 200 KB vs 7.2 s / 169 KB); PDF pipeline and preview-pages mode; accounts table; "Verify a copy" box; issuer-level suspend; Telugu native review; **anon key lock-down pending owner** |
| Signing keys | Live in `.env.local` and Vercel only. Never in chat, never committed |

### Changes against the original plan (details in FINAL_FEATURES section 8)
- Cut list said "real login/accounts": a **simulated** sign-in and three demo roles now exist. Real login and onboarding remain cut.
- Account types, permanent UV-IDs and an issuer-authority table (document type to allowed issuer category) were added.
- Sharing gained recipient requests (owner can grant less), eligibility checks, kill-user, forwarded-link denial and stamped-download fingerprints.
- Records are structured fields, not PDF files, so the PDF-only vault and preview-pages mode were not built.
- A daily server-side issuer re-check now exists (originally "no scheduler required").

---

## 1. The event and the brief (plain summary)

**IMPACTX 2026** is a 24-hour hackathon at VIT-AP (24–25 Oct 2026, venue CB-305) run by the Microsoft Student Chapter, Intelligent Intuitive AI Club and CSI. Teams redesign a government-portal experience. Format: **Round 1** = working prototype of the core challenge; **Round 2** = shortlisted teams receive hidden requirements and adapt the same prototype. Organizers also release curveballs at **Hour 12** and judges **inject faults live**.

**Challenge 02 reference:** DigiLocker. **Brief in one paragraph:** a graduate applies at the same time for a job, a scholarship and an overseas credential check. Their degree certificate spells the name differently from their ID, a marksheet is a poor two-script scan, and the income certificate expired 9 days ago. A recipient asks for a full ID number it doesn't need. Later a share link is found forwarded to a stranger. The graduate wants to see who accessed what, cut off that link, and keep the other shares working.

**What judges score:** problem understanding, innovation, usefulness, usability and accessibility, technical implementation, feasibility, responsible design, quality of demo.

**Tiers:** *Core* (working end-to-end flow + one exception path, labelled synthetic data) → *Advanced* (most capability dimensions, constraints enforced) → *Elite* (elite dimensions, curveballs, passing live stress tests). **"Depth in fewer places beats shallow coverage of everything."**

### Rules we must obey (from the organizers' brochure)
- Original work only; open-source libraries are allowed **if disclosed**. AI tools are allowed, but the team must understand, test and explain everything submitted.
- **Synthetic data only.** Label every mock API and simulated transaction. Never claim a real government service is connected. Never probe real government portals.
- No secrets (keys, OTPs, tokens) on screen or in public repos.
- Consider disability, regional language, low digital literacy, low bandwidth.
- Be honest about what is implemented, simulated, estimated or missing. Do not present AI predictions as guaranteed.
- Do not assume deadline extensions.

### Universal hard requirements (apply to every challenge)
1. Seeded dataset with **≥15 planted conflicts**, documented in a one-page **data card**.
2. **Explicit state machines**, no single "status" field collapsing stages.
3. Every automated output shows **reason, confidence, source/freshness, and a human override/escalation**.
4. Survive **≥3 judge-chosen injected faults** live (stale data, timeout, conflicting update, malformed input, connectivity loss).
5. One-page **threat model**: top 5 abuse/privacy risks with mitigations actually implemented.
6. Primary flow works **keyboard-only and with a screen reader**, in **English + one Indian language**, on a **throttled connection**.
7. **≥15 scripted test cases** with expected outputs, run live, pass rate reported (and precision/recall where relevant).
8. **Tamper-evident, append-only audit log.**
9. If an LLM is used: grounding, refusal on out-of-scope, resistance to prompt injection.

### Challenge-02-specific requirements
Purpose-specific readiness from a **declarative rule format** (pass / fail / unknown); entity resolution across documents that **never auto-merges**; OCR with per-field confidence, side-by-side view, and a correction layer kept as **separate assertions** (originals immutable); **field-level selective disclosure** with a recipient-view preview; **consent ledger** (purpose, fields, recipient, expiry, access count) with verifiable revocation that states what revocation can't undo; *Elite:* per-recipient tokens/watermarks to trace and kill a leaked link; *Elite:* continuous issuer re-check that identifies every affected share.
**Curveballs:** one altered digit in a certificate; hidden text in a PDF telling the assistant to share everything; a recipient asking for more fields than its purpose justifies; the issuer verification service down at submission time.
**Constraints:** never treat OCR as authoritative without user confirmation; sensitive documents never in public links/URLs/analytics/logs (**automated log-scrubbing test**); show exactly what is shared, with whom, for how long **before** confirming, then issue a **share receipt**; retention and deletion path including user erasure **and its limits**; visually and in the data model distinguish **issuer-verified, user-uploaded, user-corrected**.
**Metrics to report:** share of ≥15 seeded inconsistencies detected + false-alarm count; field-level OCR accuracy before/after correction on a mixed-script set; automated check showing zero sensitive fields in logs and share URLs.

---

## 2. The idea in one paragraph

**UNIVAULT** is a document vault where **originals are immutable evidence** and everything else — corrections, name links, shares, revocations, erasures — is a **separate, signed, append-only layer** on top. Documents are verified by comparing a **SHA-256 fingerprint** (whole record and per field) against a **signed (mock) issuer registry**. Sharing is **purpose-bound, minimal, per-recipient and traceable**: each recipient gets their own link, must prove an approved recipient ID plus a one-time code, sees a diagonal watermark with their identity, and the owner can kill one link or all links and gets notified of suspicious access.

### Three trust tiers (shown visually and stored in the data model)
| Tier | Meaning | Visual |
|---|---|---|
| **Issuer-verified** | Signature valid and hash/fields match the registry | solid badge |
| **User-uploaded** | Uploaded, not (yet) verified | outlined badge |
| **User-corrected** | A user assertion layered over an original, with provenance | dashed badge |

### Honesty statements that must appear in the UI
1. The **issuer is a simulation**. Hashes and signatures are real cryptography; no government system is connected.
2. **Selective disclosure here is an *attestation*, not zero-knowledge.** UNIVAULT sees your full data and signs a statement such as "over 18 = yes" that omits the birthday. The recipient trusts UNIVAULT's signature; they cannot independently prove it. (True zero-knowledge proofs let a recipient verify with no trusted intermediary; out of scope.)
3. **Revocation cannot recall copies already downloaded.**
4. A watermark **traces** a leak; it cannot prevent screenshots.
5. Tamper wording is neutral: "doesn't match the issuer's record; may be a scanning or typing mistake". Never accuse.
6. OCR text is **unconfirmed** until the user confirms it.

---

## 3. Architecture

```
Browser (Next.js App Router, TS)           Server (Next.js route handlers)            Supabase (ap-south-1)
 ├ Vault / readiness / share builder   ──▶  /api/issuer/*   (MOCK issuer, signs)   ──▶  Postgres (RLS, triggers)
 ├ Recipient view  /s/[token]          ──▶  /api/verify     (hash + sig checks)        Storage (originals, content-addressed)
 ├ Fault panel, eval runner, notif bell ◀─  /api/share/*    (tokens, OTP, policy)       Realtime (access_log → bell)
 └ Tesseract.js OCR (+ fixtures)            /api/erase, /api/recheck
```
- **Hashing/signing:** Node `crypto` (SHA-256, Ed25519). Server-side only.
- **Database enforces integrity:** append-only tables reject UPDATE/DELETE via trigger; `ledger` computes its own hash chain in a BEFORE INSERT trigger; `verify_ledger()` re-checks the chain.
- **Demo-mode security caveat (put in threat model):** only the public anon key is used, with RLS allowing read + append. No real login (a simulated sign-in with three demo roles). **Update:** the app uses `SUPABASE_SERVICE_ROLE_KEY` server-side when set; until the owner sets it and runs `docs/sql/004_lock_anon.sql`, the public anon key can still read every table and the threat model says so. The mock issuer registry is writable with the anon key, which is why **registry entries are signed**: forged entries fail signature verification.

### Data model (tables already created)
`documents` (immutable: hash, metadata, tier) · `document_payloads` (deletable sensitive content + OCR confidences) · `document_events` (state log: uploaded, extracted, user_confirmed, verified, unverifiable, tamper_flagged, superseded, revoked, erased) · `assertions` (corrections with provenance) · `entity_links` (user-confirmed same-person decisions) · `issuer_registry` (serial, record hash, per-field hashes, status, version, signature) · `issuer_config` (is_down fault toggle) · `recipients` · `shares` (immutable; includes `policy` jsonb) · `share_events` · `share_tokens` (token stored only as hash, plus recipient code, OTP hash, watermark) · `token_events` · `access_log` (client hint only, hashed) · `ledger` (hash-chained).

### State machines (separate named states, legal transitions only)
- **Document:** `uploaded → extracted → user_confirmed → verified | unverifiable | tamper_flagged → superseded | revoked → erased`
- **Share:** `drafted → previewed → confirmed → active → revoked | expired`
- **Token:** `issued → active → killed | expired`
- Verification state is tracked **separately** from share state ("verified but revoked by owner" must be representable).

---

## 4. Feature list with feasibility

**Feasibility scale:** 🟢 Easy (<2h, well-known) · 🟡 Medium (2–5h, some design) · 🔴 Hard (>5h or risky). Hours are rough for one developer, including a basic UI. **Priority:** P0 must ship · P1 should ship · P2 only if time remains.

### CORE

**F1 · Vault with immutable originals & three trust tiers** — P0 · 🟢 ~3h
*What:* upload/store documents; originals are content-addressed (SHA-256) and cannot be edited; each shows its tier badge.
*Why it's required:* brief demands the three tiers visually and in the data model.
*How:* `documents` + `document_payloads` + `document_events`; tier is derived from events and assertions.
*Done when:* editing/deleting a document row fails at the database; badges render for all three tiers.

**F2 · Seeded messy dataset (17 planted conflicts) + one-page data card** — P0 · 🟡 ~4h
*What:* a **synthetic data lab** (§16) that generates seeded, varied personas and documents, plus one showcase scenario composed from the same generic recipes, containing ≥15 planted problems (see §6). A one-page data card lists each problem and the rule expected to catch it. **No output may be hard-coded to a specific document or persona (§16).**
*Why:* hard requirement #1 and the main metric (detection rate, false alarms).
*Feasibility note:* mostly writing careful data; do this early because every other feature is tested against it.

**F3 · Readiness per purpose (declarative rules, three-valued)** — P0 · 🟡 ~5h
*What:* three recipients (Job, Scholarship, Overseas credential check). Each is a JSON file of rules; each rule yields **pass / fail / unknown** with a reason and the document it used. Adding a recipient needs no code.
*How:* small evaluator with ~6 predicates: `doc_exists`, `verified`, `not_expired`, `name_consistent`, `scan_confirmed`, `age_at_least`. Overall readiness: all pass → ready; any fail → not ready; otherwise "needs confirmation".
*Done when:* the expired income certificate shows ❌ "expired 9 days ago"; an unconfirmed OCR field shows ❓.

**F4 · Same-person detective (entity resolution)** — P0 · 🟡 ~5h
*What:* compares names across documents handling initials, honorifics, word order and **Telugu↔Latin transliteration**. Outputs, for every candidate pair, a score, verdict and plain-language explanations, **ranked best-first across all candidate matches**, ("initial G could stand for Gudipati"). **Never auto-merges**; a link is created only by an explicit user click and stored in `entity_links`.
*How:* tokenise → transliterate → phonetic key → Jaro-Winkler + initial expansion. Draft is in `src/lib/names.ts` (untested).
*Risk:* transliteration quality. Mitigation: tune on the seeded names only, and show explanations so judges see the reasoning rather than a magic score.

**F5 · OCR with confidence, side-by-side view, correction layer** — P1 · 🟡 ~6h
*What:* OCR a scanned marksheet; show the image beside extracted fields with per-field confidence; user can correct a field; the correction is saved as a **separate assertion** (field, old, new, author, time, evidence). Original image and original OCR output never change. OCR output stays "unconfirmed" until the user confirms.
*How:* Tesseract.js in the browser (English + Telugu data) **plus precomputed fixtures as fallback** so the demo cannot fail on bad OCR.
*Metric to report:* field-level accuracy before/after correction on a **mixed-script test set we generate ourselves** (3–5 synthetic scan images: rendered English + Telugu text with blur/noise/skew, each with known ground-truth text). Also report an OCR **confidence-calibration** table (are low-confidence fields actually the wrong ones?), which satisfies the brief's 'calibration where relevant'.

**F6 · Share builder, recipient-view preview, share receipt** — P0 · 🟡 ~5h
*What:* choose recipient, purpose, fields, expiry, and access policy; see an exact preview of what the recipient will see; confirm; receive a receipt.
*Done when:* nothing is shared before the confirmation click, and the receipt lists fields, recipient, expiry and policy.

**F7 · Consent ledger (hash-chained) with "Verify ledger"** — P0 · 🟢 ~3h (database part already done)
*What:* every share, revocation, verification, erasure and **every access attempt (allowed or denied)** is a ledger line, so 'who accessed what, when' is backed by the verifiable chain and not only by the plain access log; each share shows its live **access count**; lines chain by hash; a button re-computes the chain live via `verify_ledger()`.
*Demo tip:* show a failing check is impossible to fake — attempt an UPDATE in a SQL console and show it rejected.

**F8 · Revocation with honest limits** — P0 · 🟢 ~2h
*What:* revoking writes a new event (nothing erased) and shows: "Access stopped. If they already saved a copy, we can't remove it." A **'Test this link now'** button then proves the revocation is real by showing the link now returns *denied* (the brief asks for *verifiable* revocation).

### ADVANCED

**F9 · Field-level selective disclosure ("over 18", "passed")** — P1 · 🟡 ~4h
*What:* share derived claims or chosen fields without hidden ones (no birthday, no marks).
*How:* salted-hash disclosures (SD-JWT style) and/or a vault-signed attestation. See §7 for library options. **UI must say "attestation, not zero-knowledge".**

**F10 · Over-broad request detector** — P1 · 🟢 ~2h
*What:* each purpose has an allowed-field map; a request beyond it is flagged with an explanation and a minimal alternative (e.g. last 4 digits instead of the full ID number).

**F11 · Issuer verification & tamper detection** — P0 · 🟡 ~5h
*What:* verifies a document against the **signed mock registry**: (1) lookup by serial; (2) check the registry reply's **signature**; (3) check status (revoked/superseded); (4) compare whole-record SHA-256 for digital originals, or per-field comparison for confirmed OCR scans; (5) on mismatch, list the exact fields that differ using per-field hashes. Each result records time and registry version (freshness).
*Notes:* a hash says "different" but not *where*, hence per-field hashes. A scan can never match a file hash, hence field comparison, labelled as weaker evidence. Draft is in `src/lib/issuer.ts` (untested).
*Done when:* the altered-digit certificate shows the exact field; a forged registry reply is rejected.

**F12 · Degraded mode when the issuer is unreachable** — P1 · 🟢 ~2h
*What:* each attempt waits up to **8 s**, then the document shows "Unverified: issuer unreachable at HH:MM — retrying". Background retries at ~10 s, 30 s, 60 s, 120 s (≈2 min window), then a manual "Retry now". Shares made while unverified carry the label. *(Design note: a single 2-minute blocking wait would freeze the UI and look broken in a live demo.)*

**F13 · Prompt-injection & hidden-text defence** — P1 · 🟢 ~2h
*What:* document text is treated as **data only**. Shares require an explicit UI confirmation, enforced server-side, so no document content can trigger one. A detector flags instruction-like phrases, zero-width characters and text hidden from the page view. Draft: `src/lib/injection.ts`.
*Assistant panel (needed so the curveball is real):* the brief's curveball says hidden text instructs *the assistant* to share every document. So include a small **deterministic assistant panel** ("Get me ready for the scholarship") that reads documents and **proposes** actions as cards; it can never execute a share, which always needs the user's own confirmation click. The hidden-text PDF is run through this panel in the demo and visibly changes nothing. If Gemini is later added for phrasing, it only rewrites explanations and has no tool access.

**F14 · Fault-injection panel** — P1 · 🟡 ~3h
*What:* admin panel, one button per fault, each with a **defined, visible behaviour** and recovery:
- **Issuer timeout** → documents show 'Unverified: issuer unreachable', retries run (F12), recover to verified automatically.
- **Stale data** → registry answer older than 24 h is labelled 'stale (last verified N h ago)' and is re-verified before any share.
- **Malformed upload** → rejected with a plain-language reason; nothing stored; logged.
- **Conflicting update** → issuer supersedes a record while a share is being built; builder shows a diff and blocks confirmation until the user re-reviews.
- **Connectivity loss** → in-progress share draft is kept locally and resumes without duplicating the share (idempotency key).
Judges will pick ≥3 live.

**F15 · Evaluation harness (≥15 scripted tests, live)** — P0 · 🟡 ~4h
*What:* a page/command that runs all scripted cases against the seeded set and prints pass rate, detection rate and false alarms. See §8.

**F16 · Log-scrubbing test** — P1 · 🟢 ~2h
*What:* one central logger with redaction; an automated test greps all captured logs and generated share URLs for the seeded sensitive values and must find **zero**. Draft: `src/lib/scrub.ts`. Set `NEXT_TELEMETRY_DISABLED=1` and add no third-party analytics, so the brief's 'analytics' clause is true by construction (and say so).

**F17 · Threat-model page** — P1 · 🟢 ~2h
*What:* one page, top 5 risks with mitigations that exist in code: link forwarding, prompt injection, over-collection, log leakage, OCR trusted as authoritative (plus an honest "known limits" box: anon-key demo mode, screenshots).

**F18 · Accessibility, Telugu, low bandwidth** — P0 for the primary flow · 🟡 ~6h
*What:* keyboard-only operation with visible focus; screen-reader labels and live regions for status changes; English + **Telugu** for the main flow (vault, readiness, share, revoke); a light recipient page that works on a throttled connection.
*Test:* axe-core scan, keyboard walkthrough, Lighthouse/DevTools "Slow 3G".

### ELITE

**F19 · Secure per-person shares (the headline demo)** — P0 for core parts · 🔴 ~10h total
Sub-features:
- **Per-recipient token** — random 256-bit token; only its hash is stored.
- **Recipient identity gate** — link alone is not enough; the visitor must enter the approved **recipient ID** plus a **one-time code** (code shown on-screen and labelled *simulated*; no real SMS/email).
- **Watermark** — full-page, diagonal, tiled, low opacity (~8–10%): `name · recipient ID · time · session code`. Slightly stronger on downloaded copies. Draft: `src/lib/watermark.ts`.
- **Access policy per share** — *View only* (rendered, watermarked page; no raw file served) or *Download allowed* (copy stamped with watermark; its fingerprint is recorded in the ledger). Optional max views.
- **Kill one link / Kill all links** — each writes events; other shares unaffected when killing one.
- **Notification bell** — via Supabase Realtime on `access_log`. Notify on: first open; open from a new device; attempt on a killed/expired link; wrong recipient ID/code. Not on every view (avoids noise).
- **Leak trace** — a tool where you paste/enter the text read off a leaked screenshot's watermark and it resolves to the recipient/session in the log.
*Honest limits:* watermark can be cropped; view-only cannot stop screenshots. Strict mode: forwarding fails because the new person can't pass the ID gate. (Delegated sub-sharing is out of scope.)

**F20 · Issuer re-check & affected-share finder** — **P1 (promoted from P2 after the audit: it is one of the brief's two Elite dimensions)** · 🟡 ~3h
*What:* a "Re-check now" button plus background poll; when a record becomes superseded/revoked, list every active share that used it and notify the owner. Verification also re-runs automatically **just before every share**.

### POLICIES & DELETION

**F21 · Policy pages (EN + TE)** — P1 · 🟢 ~3h
Three in-app pages: **Rules & Regulations** (prototype, synthetic data only, simulated issuer, user responsibility, abuse rules), **Privacy Policy** (what is stored; what is not: raw tokens, raw IPs, sensitive fields in logs/URLs; who sees what), **Deletion & Retention Policy**. *Principle:* policies may only state what the code actually does. Label: "prototype policy, not legal advice".

**F22 · Erase-my-document flow** — P1 · 🟡 ~3h
*What:* erasure deletes the **payload row and stored file**; revokes active shares that used the document; writes `erased` event + ledger line. The immutable `documents` row and ledger keep only **non-sensitive** facts (hash, type, times).
*Limits shown before confirming:* downloaded copies can't be recalled; hashes and event times remain; active shares are revoked first.
*Retention defaults:* shares max 30 days; access log keeps only hashed hints.

**F23 · Explain / qualify / override on every automated output** — P0 · 🟢 ~3h
*What:* one reusable UI component attached to every automated result (readiness line, name match, OCR field, verification result, injection flag, over-broad warning). It always shows: **reason**, **confidence or uncertainty** (score, pass/fail/unknown, or evidence strength), **source and freshness** (which document/registry version, checked when), and **two actions: Correct/Override and Escalate/Dispute**. Overrides and disputes are append-only events and ledger lines (e.g. 'user marked this injection flag as a false positive'; 'user disputes tamper flag, asks issuer re-check').
*Why:* universal hard requirement #3 — the audit found we described it in places but had no single mechanism guaranteeing it everywhere.

### Explicitly cut
Live OCR tuning · real login/accounts (a simulated sign-in and demo roles were added later) · a second Indian language · invisible steganographic watermark · delegated forwarding · true zero-knowledge proofs · real issuer integration.

### Effort vs capacity
P0 ≈ 45–50h of work (now includes F23); P1 ≈ 40h (now includes F20); nothing remains at P2. A team of 4 over ~20 working hours ≈ 70–80h, so expect **all of P0 plus about 60–70% of P1**. Within P1, build in this order: F20, F9, F10, F12, F13, F14, F16, F5, F17, F21, F22 (Elite-dimension and curveball items first).

---

## 5. Suggested split for 4 people

| Person | Owns | Features |
|---|---|---|
| **A — Data & rules** | schema usage, seed data, data card, rules engine, eval harness | F2, F3, F15, F10 |
| **B — Matching & issuer** | name matching, OCR + corrections, issuer verification, degraded mode, re-check | F4, F5, F11, F12, F20 |
| **C — Sharing & safety** | share builder, ledger UI, tokens/OTP gate, watermark, kill/notify, leak trace, injection, scrub test, threat model | F6, F7, F8, F9, F13, F16, F17, F19 |
| **D — Experience** | UI shell, accessibility, Telugu, low-bandwidth recipient page, fault panel, policy pages, erase flow, demo script | F1, F14, F18, F21, F22, F23 |

**Timeline (adapt to the real start time):** H0–3 schema/seed/shell · H3–8 rules, issuer, matching, vault UI · H8–12 share flow, ledger, OCR · **H12 curveball checkpoint: keep slack** · H12–17 tokens, watermark, leak trace, fault panel · H17–21 tests, a11y, Telugu, policies · H21–24 docs, rehearsal, freeze at H23.

---

## 6. Seeded conflict set (≥15; adjust the exact data as you build)

Persona: a synthetic graduate (use a clearly fictional name; all numbers fake). Documents: national-ID-like card, degree certificate (digital original), degree copy received by email, marksheet scan (English + Telugu), income certificate, provisional certificate, reference letter PDF, duplicate scan.

| # | Planted problem | Expected detector |
|---|---|---|
| 1 | Degree certificate has full expanded name; ID has shorter form | name match (likely_same) → needs user link |
| 2 | Marksheet uses initials ("G. Sai Krishna") | name match with initial expansion |
| 3 | Marksheet also has the name in Telugu script | transliteration match |
| 4 | Word order differs between two documents | name match, "same words, different order" |
| 5 | Income certificate expired 9 days ago | `not_expired` → fail |
| 6 | Marksheet scan low quality; some fields below confidence threshold | OCR confidence flag → unknown |
| 7 | One OCR field misread (digit) | user correction as assertion |
| 8 | Degree copy with **one altered digit** vs issuer record | tamper_flagged with exact field |
| 9 | Duplicate/re-scan of the same document | duplicate detection (hash/field similarity) |
| 10 | Provisional certificate superseded by the final degree | issuer status superseded |
| 11 | Reference letter PDF with hidden instruction text | injection detector |
| 12 | Recipient requests full ID number for a scholarship check | over-broad request |
| 13 | DOB format differs across documents (DD-MM-YYYY vs YYYY-MM-DD) | normalisation, no false mismatch |
| 14 | Issuer record unreachable at submission | degraded mode |
| 15 | Share link opened from a second device | notification + leak trace |
| 16 | Attempt to open a killed link / wrong recipient ID | denied + logged + notified |
| 17 | Registry reply with invalid signature | rejected as untrusted |

Also include a few **negative controls** (documents that should raise **no** alarm) so you can report a real false-alarm count.

---

## 7. Open-source evaluation

*Verified = I opened the project page in this session. "General knowledge" = commonly used, not re-checked now; confirm license and version at install time.*

| Tool | Use for | Verified findings | Recommendation |
|---|---|---|---|
| **Tesseract.js** (Apache-2.0) | In-browser OCR (F5) | Runs in browser and Node; load a language by code (`createWorker('eng')`). The project **does not improve the recognition model's accuracy and does not read PDFs**. Telugu traineddata exists in Tesseract distributions (Linux packages for Telugu language data exist), but I could not confirm the exact list on the project page. | **Use**, with `eng`+`tel`, **and keep precomputed OCR fixtures as fallback.** Convert PDF pages to images first. |
| **sd-jwt-js** `@sd-jwt/core`, `@sd-jwt/sd-jwt-vc` (Apache-2.0) | Standards-based selective disclosure (F9) | Implements RFC 9901 SD-JWT and SD-JWT-VC draft; works in Node and browser; you supply signer/verifier/hasher. **The repository is archived/read-only; development ended Sept 2026 and moved to "identity-common-ts".** | **Optional.** Pin the version if used; gives a "standards-based" talking point. Otherwise implement the small salted-hash scheme yourself (≈100 lines) and call it "SD-JWT-style". Don't depend on future updates. |
| **MOSIP Inji Verify / Inji Certify** | Reference for credential issuing/verification | Inji Verify verifies W3C VCs (JSON-LD and SD-JWT), supports Ed25519, checks revocation status, offers React/TypeScript SDK modules. License not stated on the page I read. | **Don't integrate in 24 h.** Cite it as alignment: "our signed registry entries map to W3C VCs verifiable by tools like Inji Verify". Good for the *Feasibility/Future work* slide. |
| **Sanscript** (`@indic-transliteration/sanscript`) | Telugu → Latin (F4) | Supports Telugu as a built-in script and ITRANS/IAST/Harvard-Kyoto output. I could not confirm its license or current maintenance from the page I reached. | **Optional.** Check license before use. Our own small mapper in `names.ts` works for names; either way a **phonetic key** step is still needed for matching. |
| **json-logic-engine** (MIT) | Declarative rules (F3) | JSON rules, custom operators, claims safeguards for untrusted rules. Three-valued logic isn't built in; maintenance status not shown. | **Optional / probably skip.** Six hand-written predicates returning pass/fail/unknown are simpler and easier to explain to judges. |
| **pdf-lib**, **pdfjs-dist** | Stamp watermark on downloads; extract text incl. hidden text from PDFs | General knowledge | Use if you implement PDF download watermarking and PDF hidden-text detection. |
| **axe-core** + **@axe-core/playwright**, **Playwright** | Accessibility scans, keyboard tests, throttled-network run | General knowledge | **Use** for F18 evidence (report "0 critical axe violations" and a keyboard-only script). |
| **Vitest**, **fast-check** | Unit and property tests; the eval harness | General knowledge | **Use** Vitest. fast-check is a nice-to-have for hash/ledger properties. |
| **next-intl** or **i18next** | EN/TE strings | General knowledge | Use one. Keep Telugu strings in a single JSON for review. |
| **@supabase/supabase-js** (Realtime) | DB access, notification bell | Already in project | Use. |
| **Zod** | Validate API inputs and malformed uploads | General knowledge | Use at API boundaries. |

**Not recommended:** anything needing a paid cloud OCR/LLM API in the critical path; any wrapper that pretends to connect to real DigiLocker or government APIs (violates the brochure).

---

## 8. Evaluation harness — suggested 18 test cases

Each has an input, an expected output, and runs live; show **pass rate** plus **detection rate / false alarms** on the seeded set.
1. Expired income certificate → `not_expired` fails with "9 days".
2. Unconfirmed OCR field → rule is `unknown`, not pass.
3. Name: expanded vs short form → `likely_same`, `autoMerge=false`.
4. Name: initials vs full → `likely_same`/`possible` with initial explanation.
5. Name: Telugu vs Latin → match.
6. Name: genuinely different person → `unlikely`.
7. Altered-digit certificate → `tamper_flagged`, exact field named, neutral wording.
8. Exact original → `verified` via hash.
9. Scan with all fields confirmed and equal → `verified` via fields (labelled weaker).
10. Forged registry signature → rejected.
11. Revoked/superseded entry → state set accordingly.
12. Issuer unreachable → `unverifiable` with timestamped label, retry scheduled.
13. Hidden-instruction PDF → flagged; no share is created.
14. Over-broad request → flagged with minimal alternative.
15. Ledger chain verifies; tampering attempt on an append-only table is rejected.
16. Killed link → denied, logged, notification generated; other links still work.
17. Wrong recipient ID/OTP → denied and notified.
18. Log-scrub: zero sensitive values in captured logs and share URLs.
Also: "negative controls raise no alarm".

---

## 9. Demo script (≈6–8 min)

1. Open the vault: messy documents, tier badges. State the honesty line (simulated issuer).
2. Readiness for the three purposes → show ❌/❓ reasons (expired income certificate, unconfirmed OCR).
3. Name detective → explanations → user confirms a link (show it never auto-merges).
4. Scan → low-confidence fields → correct one → show original unchanged + assertion record.
5. Tamper check on the altered-digit copy → exact field, neutral wording.
6. Hidden-text PDF → flagged, nothing shared.
7. Build a share for the job recipient: over-broad request flagged → minimal alternative → preview → confirm → receipt.
8. Recipient opens the link: ID + OTP gate, watermark. Then a stranger opens it → denied → bell notification → **leak trace** → **kill that link only** → other shares still work.
9. Verify ledger; show an UPDATE attempt rejected in SQL.
10. Judge-chosen faults via the fault panel (issuer timeout → degraded mode).
11. Run the eval harness live; show pass rate, detection rate, false alarms, zero-leak check.
12. Finish with limits (screenshots, anon-key demo mode, attestation ≠ zero-knowledge) and what was deliberately cut.

---

## 10. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Telugu transliteration/matching quality | Tune on seeded names; always show explanations; keep user confirmation mandatory. |
| OCR flakiness in demo | Precomputed fixtures behind a toggle; real OCR shown as a live extra. |
| Over-building Elite features | Freeze scope at Hour 12; P2 only after P0 demo-ready. |
| Realtime notifications fail on venue Wi-Fi | Fall back to polling the access log every 5 s. |
| Demo-mode security (anon key) questioned | State it openly; point to signed registry entries, append-only triggers and hashed tokens. |
| Curveball changes a rule at Hour 12 | Keep rules in JSON files; show a diff of what changed and which readiness results flipped. |
| Secrets leaking to a public repo | `.env.local` in `.gitignore`; only the public anon key is client-side; signing keys server-only. |

---

## 11. Policy content outline (F21/F22)
- **Rules & Regulations:** prototype; synthetic data only; issuer simulated; verification is guidance not an official decision; user responsible for what they share; no forgery, probing or scraping.
- **Privacy:** stores documents (payloads), corrections, shares, hashed access hints; does **not** store raw tokens, raw IPs, or sensitive fields in logs/URLs; recipients see only approved fields, watermarked; attestation is signed by UNIVAULT, which sees full data.
- **Deletion & Retention:** erasure removes payload + stored file and revokes active shares; ledger/documents rows keep only hashes, types and times; limits (downloaded copies, retained hashes); shares ≤30 days; access log holds hashed hints only.
All three: English + Telugu; each statement must be true of the code.

---

## 12. Instructions block for the coding agent (paste into Claude Code / CLAUDE.md)

```
Project: UNIVAULT — IMPACTX 2026 Challenge 02. Next.js 15 (App Router) + TypeScript + Supabase.
Read UNIVAULT_SPEC.md fully before coding. Priorities: P0 first. Depth over breadth.

Rules:
- Synthetic data only. Label every mock/simulated thing in the UI. Never claim a real integration.
- Originals are immutable. Corrections/links/shares/revocations/erasures are new append-only rows.
- Do not edit or delete rows in append-only tables; add new event rows instead.
- Never log, URL-encode or analytics-track sensitive fields; use src/lib/scrub.ts `log()` everywhere.
- Tamper/verification wording is neutral; OCR output is unconfirmed until the user confirms.
- No LLM in decision paths. (Optional: explanation-only text, never able to create shares.)
- Every automated output shows reason, confidence/uncertainty, source+freshness, and a human override.
- Keyboard-only + screen-reader + English/Telugu + low-bandwidth for the primary flow.
- Write a Vitest test for every detector; the eval harness must run all tests live.
- NO HARDCODING (spec §16): never branch on a persona name, serial, document id or the `synthetic` flag; every output is computed from the data by the rules; expected results live only in `synthetic/labels` and test oracles, never in app code.

Setup:
1. npm install
2. cp .env.example .env.local ; fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   (Supabase project ref opgoukjysnsfzzjnfhxa — get keys from the dashboard; do not commit them).
3. Generate fresh Ed25519 keys and put them in .env.local (server-only):
   node -e "const c=require('crypto');const mk=()=>{const k=c.generateKeyPairSync('ed25519');return{priv:k.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),pub:k.publicKey.export({type:'spki',format:'der'}).toString('base64')}};const i=mk(),v=mk();console.log('ISSUER_PRIVATE_KEY='+i.priv+'\nISSUER_PUBLIC_KEY='+i.pub+'\nVAULT_PRIVATE_KEY='+v.priv+'\nVAULT_PUBLIC_KEY='+v.pub)"
4. Schema is already applied in the Supabase project; SQL is in docs/sql/ for re-creation on a fresh project.
5. Existing drafts in src/lib (crypto, issuer, names, injection, scrub, watermark) are UNTESTED — write tests first, fix, then build on them.
```

---

## 13. Definition of done (checklist)
- [x] ≥15 seeded conflicts + one-page data card (showcase 17/17; `docs/DATA_CARD.md`)
- [x] Readiness for 3 purposes with pass/fail/unknown + reasons
- [x] Name matching: explanations, no auto-merge, user-confirmed links
- [x] OCR + side-by-side + corrections as assertions; originals untouched
- [x] Verification: hash + per-field (salted, canonical) + signature; neutral tamper wording; degraded mode
- [~] Share: preview → confirm → receipt; over-broad flagged (done); details-only default hiding exact values is partial
- [x] Ledger verifies live; revocation honest about limits
- [~] Per-recipient token + ID/OTP gate + watermark + download + kill link/user/all + notifications + leak trace (done); preview-pages mode not built
- [x] Fault panel survives 3 faults (5 built); hidden-text document doesn't trigger a share
- [x] ≥15 tests run live with pass rate (21 scripted); zero-leak log check passes
- [x] Threat model + policy pages (EN/TE) + erase flow with stated limits
- [~] Keyboard-only, axe, Telugu, slow-network checks done and noted; Slow 3G target not met; Telugu not native-reviewed
- [~] README states what is simulated, real and cut; its screenshots and three-role story still need a refresh

---

## 14. Requirements traceability (checked against the brief's own text)

*Source: 'IMPACTX_20_Advanced_Problem_Statements_HardMode.pdf' (universal requirements, Challenge 02) and 'IMPACTX_2026_Rules_and_Regulations_Brochure_UPDATED.pdf'. ✔ = covered by the plan. ⚠ = gap found in the audit and fixed in this version.*

### Universal hard requirements
| Brief requirement | Covered by | Status |
|---|---|---|
| ≥15 planted conflicts + one-page data card | F2, §6 (17 items) | ✔ |
| Explicit state machines; no collapsed 'status' | §3 (document, share, token; verification separate) | ✔ |
| Every output: reason, confidence, source+freshness, human override/escalate | F23 + each feature | ⚠ no single mechanism before → F23 added |
| Survive ≥3 judge-injected faults | F14 with defined behaviours for 5 faults | ⚠ behaviours were undefined → defined |
| One-page threat model, mitigations actually implemented | F17 | ✔ |
| Keyboard + screen reader, English + Indian language, throttled bandwidth | F18 (Telugu) | ✔ |
| ≥15 scripted tests live, pass rate, precision/recall/calibration | F15, §8 (18 tests), OCR calibration in F5 | ✔ (precision/recall on seeded set + negative controls; calibration table for OCR) |
| Tamper-evident append-only audit trail for 'what happened and when' | F7 | ⚠ plain access log was not hash-chained → every access attempt now goes into the ledger |
| Responsible AI if an LLM is used | No LLM in decisions; optional explanation-only | ✔ N/A by design (OCR is the only ML; labelled unconfirmed) |

### Challenge 02 dimensions
| Brief dimension | Covered by | Status |
|---|---|---|
| Purpose-specific readiness, declarative rules, pass/fail/unknown each | F3 | ✔ |
| Entity resolution (initials, transliteration, ordering, honorifics), **ranked** explanations, never auto-merge | F4 | ⚠ ranking across candidates made explicit |
| OCR per-field confidence, side-by-side view, corrections as separate assertions, originals immutable | F5 | ✔ |
| Field-level selective disclosure + recipient-view preview | F9 + F6 | ✔ |
| Consent ledger: purpose, fields, recipient, expiry, access count | F7 | ⚠ access count display made explicit |
| Revocation verifiable; state what it cannot undo | F8 | ⚠ added 'Test this link now' to make it verifiable |
| Elite: per-recipient tokens/watermarks; trace and kill a leaked link without affecting others | F19 | ✔ |
| Elite: continuous issuer re-check; notify and list every affected active share | F20 | ⚠ was P2 → promoted to P1 |

### Curveballs and constraints
| Brief item | Covered by | Status |
|---|---|---|
| One altered digit: detect and explain without accusing | F11 | ✔ |
| Hidden PDF text tells the **assistant** to share everything | F13 + assistant panel | ⚠ there was no 'assistant' to resist → deterministic proposal-only assistant added |
| Recipient requests too many fields: explain + minimal alternative | F10 | ✔ |
| Issuer down at submission: degraded mode, clearly labelled unverified | F12 | ✔ |
| Never treat OCR as authoritative without confirmation | F5 | ✔ |
| No sensitive data in public links/URLs/analytics/logs; automated log-scrub test | F16 | ✔ (telemetry off, no third-party analytics) |
| Show exactly what/who/how long before confirm; receipt after | F6 | ✔ |
| Retention + deletion path incl. user erasure and its limits | F21, F22 | ✔ |
| Distinguish issuer-verified / uploaded / corrected visually and in data model | F1 | ✔ |
| Metric: ≥15 seeded inconsistencies detected + false-alarm count | F15 | ✔ |
| Metric: OCR accuracy before/after correction, mixed-script set | F5 | ✔ (we generate the set with ground truth) |
| Metric: zero sensitive fields in logs and share URLs | F16 | ✔ |

### Brochure rules
| Rule | Covered by |
|---|---|
| Prototype honesty: label simulated data/mock APIs; never claim a real service is connected | §2 honesty statements, §15 inventory, 'SYNTHETIC DEMO DATA' banner |
| Synthetic data; no real citizens' details in demos | §15 |
| No secrets on screen / in public repos | §10, `.gitignore`, OTP shown as *simulated* |
| Accessible by design, regional language, low bandwidth | F18 |
| Responsible claims; AI output not guaranteed | OCR labelled unconfirmed; verification wording neutral |
| Disclose open-source and significant AI use | README must list libraries (§7) and AI tools used |
| No unauthorized access to live government portals | Mock issuer only; no external calls |
| Round 2 adapt the same prototype | Rules as JSON files; headroom at Hour 12 |

**Honest residual risks:** (1) Telugu name matching is tuned on our seeded names, not a general solution; (2) selective disclosure is an attestation, not zero-knowledge (stated on screen); (3) anon-key demo-mode database (stated in threat model); (4) the watermark traces leaks but cannot stop screenshots.

---

## 15. Mock data inventory — exactly what is synthetic, what is real

**Principle:** nothing is presented as real. Every record carries `synthetic = true`, the UI shows a persistent **'SYNTHETIC DEMO DATA'** banner, and no real person, company, university or government body is imitated. The brochure *requires* synthetic data and forbids exposing real citizens' details, so **real personal documents must not be used**, not even the team's own.

### Synthetic (mock) data we create
| Item | Description |
|---|---|
| **Persona** | One fictional graduate (invented name, DOB, address). Identity-number-style values use patterns that can't be real (e.g. 12 digits starting `0000`; as far as I know real Aadhaar-style numbers never start with 0 or 1 — treat that as a belief, not a guarantee). |
| **Issuers** | Invented institutions only, e.g. 'Synthetic State University', 'Synthetic Revenue Department', 'Synthetic Identity Authority'. Never real names or logos. |
| **Documents (showcase ≈8, composed by the generator from generic recipes; the lab in §16 produces hundreds more for range testing)** | ID card; degree certificate (digital original); degree copy with one altered digit; marksheet scan (English + Telugu); income certificate (expired 9 days); provisional certificate (superseded); reference-letter PDF with hidden text; duplicate re-scan. |
| **Scan images** | Generated by us: rendered text with blur/noise/skew and known ground truth (for the OCR accuracy metric). |
| **Recipients (3)** | Invented organisations, e.g. 'Example Hiring Co.', 'Sample Scholarship Foundation', 'Sample Overseas Credential Service' — each labelled fictional. |
| **Issuer registry** | Our **mock issuer** database, signed with our own demo keys. Labelled 'SIMULATED ISSUER'. |
| **Readiness rule packs** | Our own **demo rule packs** (e.g. 'income certificate must not be expired'). They are **not official requirements**; each rule shows source 'UNIVAULT demo rule pack v1' and a last-reviewed date. Do not claim they reflect any real recipient's policy. |
| **One-time codes** | Simulated; displayed on screen and labelled as such. No SMS or email is sent. |
| **Events / access history** | **Not pre-seeded.** The diary, access log and notifications are produced live by actions in the demo, so nothing in them is invented. |
| **Test cases & negative controls** | Scripted by us in the repo, with documented expected outputs. |

### Real (not mock)
Hashing (SHA-256) and signatures (Ed25519); the hash-chained ledger and database triggers; token generation, hashing and access control; OCR actually run on our synthetic images; the name-matching, rules and detection logic; watermark rendering; log redaction; the test harness and its pass rates.

### Rules for the whole team
1. No real names, IDs, phone numbers, emails or photos of real people — anywhere, including screenshots and slides.
2. Never write or imply 'connected to DigiLocker / government'. Say 'simulated issuer'.
3. Don't present demo rules, fees, deadlines or processing times as official facts.
4. Don't upload any real document to any AI tool.
5. Report metrics only from runs on generated synthetic sets (dev and held-out), and say so.
6. The system must behave **identically on synthetic and real data** and must never special-case a document, persona or serial number. See §16.

---

## 16. Data-driven integrity & the Synthetic Data Lab

**The requirement (from the team):** the data is synthetic, but the system must treat it exactly as real. No fake outputs, no 'if this document then this result'. Every output must be *computed from the data by the rules*. We still need to know which data is synthetic, and we need a data file with enough variety to test the range of cases.

### 16.1 Principles
1. **One pipeline for everything.** Synthetic documents enter through the same `ingestDocument()` function an upload uses. Extraction, verification, rules, matching and sharing never know or care where a document came from.
2. **The `synthetic` flag is a label, not a switch.** It drives only the banner, export guards and the provenance display. It must **never** appear in a decision branch. Test: flip the flag on every document and assert every decision is identical.
3. **Tier is computed, never declared.** A document becomes *issuer-verified* only because verification (signature + hash) succeeded; the seed cannot assert it. Documents are ingested as *user-uploaded* (or via the mock issuer's 'pull' path, which is still verified at ingestion).
4. **Ground truth lives in separate files.** The generator writes `documents` and, separately, `labels` (what was planted). The app **never reads labels**; only the eval harness and tests do. Keep them in different directories (`synthetic/out/data/` vs `synthetic/out/labels/`).
5. **No literals from the data in app code.** Persona names, serial numbers, ID numbers and dates from the dataset must not appear in `src/` (outside `src/synthetic`, tests and fixtures). A test scans the source for every string value in the generated dataset and fails on any hit.
6. **Know what is synthetic.** Every document carries `synthetic_origin = {generator, version, seed, recipe, dataset: 'dev'|'heldout'|'showcase'}` (stored at ingestion; new nullable column on `documents`). The vault shows 'Synthetic: generated by <recipe>, seed N'.
7. **Explainable, not canned.** Result text is built from rule results and field values at runtime. No static strings containing outcomes.

### 16.2 The Synthetic Data Lab (`synthetic/`)
**Status: a working v0.1 already exists in `synthetic/` (see `synthetic/README.md`): 58 levels x 12 cases = 697 cases per set, dev (seed 7) and held-out (seed 99), deterministic, labels in a separate folder, plus a first baseline of the draft logic. Phase 1 reviews, tests and extends it; it does not start from zero.**

- `generate.ts` with a **seeded PRNG**: `npm run synth -- --seed 7 --n 300 --set dev` (and `--set heldout --seed 99`). Same seed gives the same dataset.
- `name-bank.json`: generic given names and surnames in Latin and Telugu script, with plausible spelling variants. Persons are combinations, so they are fictional. Never real people.
- **Mutators** (generic, composable): rename-variants, transliterate, initialise, reorder, add-honorific, shift-date, change-date-format, alter-digit, swap-fields, drop/add field, homoglyph/Unicode swap, add-OCR-noise(level), duplicate(exact|near|rescan), inject-text(variant), set-issuer-state, set-expiry-offset, set-age-boundary.
- **Recipes** compose mutators into scenarios. The Challenge-02 showcase ('graduate_demo') is one recipe built from the same mutators, not hand-crafted data.
- Outputs: `dataset-dev.json`, `dataset-heldout.json`, matching `labels-*.json`, scan images with ground-truth text, a **coverage report**.
- **Dev vs held-out:** tune matching/OCR/rules only on `dev` (seed A). Report headline metrics on `heldout` (seed B), which is never used for tuning. This fixes the earlier risk that Telugu matching was tuned only on our seeded names.

### 16.3 Variety to cover (dimension → levels)
| Dimension | Levels to generate (examples) |
|---|---|
| Name patterns | exact; initials; expanded; reordered; honorific; hyphenated; single-name; very long; Telugu script; mixed script; diacritics; typo; **different person with a similar name** (negative) |
| Dates | expires in future; expires today; expired 1 day / 9 days / 400 days ago; future-dated issue; leap day; DOB: turns 18 tomorrow / today / yesterday; formats DD-MM-YYYY, YYYY-MM-DD, '5 May 2003', Telugu numerals |
| Tampering | none; single digit; two fields; swapped fields; extra field; missing field; trailing whitespace; homoglyph; whole-record replaced |
| Scan quality / OCR | clean; mild blur; heavy noise; skew; low contrast; mixed script; digit confusions (0/O, 1/l, 5/S); Telugu conjuncts |
| Issuer state | active; superseded; revoked; unreachable; stale (>24 h); forged signature; unknown serial; version bump after share |
| Duplicates | exact; near-duplicate (reformatted); re-scan of same paper; same serial different content |
| Injection | visible instruction; zero-width characters; hidden (white/tiny) text; multilingual instruction; instruction-like but benign wording (e.g. the word 'assistant' in a reference letter — **must not flag**) |
| Over-broad requests | none; one extra field; many extra fields; full ID instead of last 4; purpose mismatch |
| Sharing | expiry now / 30 days / past; view-only / download; max views; wrong recipient ID; reused OTP; killed link; two devices; revoked then re-shared |
| Negative controls | clean documents with every field valid; near-miss cases that look suspicious but are fine |

**Targets:** ≥300 documents per set (dev, held-out), **≥10 cases per level**, with the coverage report printing counts per dimension × level so judges see the range tested.

### 16.4 How 'expected output' is decided without hardcoding
- **By construction:** the generator knows what it planted, so it writes the label (e.g. `{docId, expected: 'tamper_flagged', fields: ['cgpa']}`; negatives get `expected: 'none'`).
- **Differential oracle:** `tests/oracle.ts` is a deliberately simple, separately written reference implementation of the rule semantics (date maths, name tokens, three-valued logic). Tests run the real engine and the oracle on all generated cases and report disagreements. Each disagreement is investigated and recorded, not suppressed.
- **Metamorphic tests** (the strongest proof there is no hardcoding):
  - Rename a persona consistently across all documents → readiness and matching results unchanged.
  - Shift every date by +N days → results unchanged (relative logic).
  - Move an expiry date across the boundary by ±1 day → result flips exactly at the boundary.
  - Reorder documents / shuffle input → same results.
  - Alter exactly one digit in a verified record → tamper flag naming exactly that field.
  - Flip the `synthetic` flag → identical decisions.
  - Regenerate with a different seed → metrics stay within a stated tolerance.
- **Property tests** (fast-check or seeded loops): originals never change; no auto-merge ever; ledger always verifies; raw tokens never stored; no sensitive value in logs or URLs, across all generated personas.

### 16.5 What the eval page reports
Per category: counts, precision, recall, false alarms (dev and held-out separately); OCR accuracy before/after correction and calibration; metamorphic/property test pass counts; the hardcoding scan result; the coverage matrix. Anything not detected is listed honestly.

### 16.6 Acceptance
- [ ] `grep`-style scan finds zero dataset literals in app code
- [ ] flipping `synthetic` changes no decision
- [ ] seed script and upload route share `ingestDocument()`
- [ ] tier derived only from verification
- [ ] ≥300 docs/set, ≥10 per level, coverage report generated
- [ ] held-out metrics reported separately from dev
- [ ] differential oracle disagreements documented
