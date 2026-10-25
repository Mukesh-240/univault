<p align="center"><img src="public/brand/logo-192.png" width="112" height="112" alt="UNIVAULT logo"></p>

<h1 align="center">UNIVAULT</h1>

<p align="center"><b>Your documents, one place.</b><br>
Purpose-aware readiness, honest provenance, and minimal, traceable, revocable sharing.<br>
<i>Don't ask for the document. Ask for the answer.</i></p>

<p align="center">
<img alt="unit tests" src="https://img.shields.io/badge/unit%20tests-362%20passing-2ea44f">
<img alt="browser tests" src="https://img.shields.io/badge/browser%20tests-334%20(in--memory%20store)-2ea44f">
<img alt="axe" src="https://img.shields.io/badge/axe-0%20violations-2ea44f">
<a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue"></a>
<img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs">
<img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white">
<img alt="synthetic data" src="https://img.shields.io/badge/data-synthetic-F4A53B">
</p>

<p align="center">
<b><a href="https://univault-zeta.vercel.app">Live demo</a></b> ·
<a href="https://univault-zeta.vercel.app/demo">Six-step demo guide</a> ·
<a href="https://univault-zeta.vercel.app/features">Every feature and its status</a> ·
<a href="https://github.com/Mukesh-240/univault">Code (MIT)</a>
</p>

> **Everything here is a prototype on synthetic data.** The issuer, the identity check and the one-time codes are
> **simulated**. No real DigiLocker, Aadhaar, university, government office or employer is connected. The hashes and
> signatures are real cryptography.

**Team SPACEX · VIT-AP University · IMPACTX 2026 · Challenge 02 "Your Documents, One Place"**

## Contents

1. [The problem](#1-the-problem)
2. [Our idea](#2-our-idea)
3. [The demo cast and the six steps](#3-the-demo-cast-and-the-six-steps)
4. [A walk through the product](#4-a-walk-through-the-product)
5. [How it works: the flows](#5-how-it-works-the-flows)
6. [Trustworthy under failure](#6-trustworthy-under-failure)
7. [What it does, mapped to the brief](#7-what-it-does-mapped-to-the-brief)
8. [Architecture](#8-architecture)
9. [Results](#9-results)
10. [Security](#10-security)
11. [Honest status and limits](#11-honest-status-and-limits)
12. [Built on top, not a clone](#12-built-on-top-not-a-clone)
13. [What's next](#13-whats-next)
14. [Run it locally, or deploy](#14-run-it-locally-or-deploy)
15. [Open-source credits](#15-open-source-credits)
16. [Team](#16-team)

---

## 1. The problem

**Meet Mahesh.** He has just graduated from VIT and is applying for a job at Google.

| Moment | What goes wrong today |
|---|---|
| **Before:** am I even ready? | His income certificate expired nine days ago and his name is spelled three ways across his documents. He finds out *after* he applies. |
| **While:** one fact, whole PDF | The employer wants his full ID number to check one fact: is he over 18? He emails the entire PDF. |
| **After:** no control | The PDF is forwarded. He cannot see who opened it, and he cannot take it back. |

Underneath are three problems:

1. **Validity depends on who is asking.** A one-year-old income certificate fails a scholarship and is irrelevant
   to a job. Owners can't tell before they submit.
2. **Records can't be blindly trusted.** They can be expired, duplicated, inconsistent, misread by OCR, revoked,
   altered or hostile. Silently "fixing" them would hide the truth.
3. **Sharing is where control is lost.** All-or-nothing sharing, recipients who ask for too much, forwarded links,
   and no honest answer about what "revoke" can undo.

All three must be fixed **without ever altering the original record.** UNIVAULT fixes each moment, and says plainly
what it can't.

## 2. Our idea

**Purpose-aware readiness + honest provenance + minimal, traceable, revocable sharing.** The owner knows where they
stand before applying, and stays in control after sharing.

| Role | Who it is | What it can do |
|---|---|---|
| **Issuer** | A university or government office: the source of truth | Signs and issues records; can revoke or replace a record at any time |
| **Sender** (the owner) | The student or citizen who holds the documents | Sees readiness per purpose and every share; shares only what is needed; stops sharing |
| **Receiver** | An employer, scholarship body or credential evaluator | Asks for a specific purpose and gets only what is needed, or a yes/no answer instead of documents |

**Four rules we don't break**

| Rule | What it means in the code |
|---|---|
| **Originals stay untouched** | Corrections, links, shares and kills go into an append-only, hash-chained ledger. Database triggers block UPDATE and DELETE. |
| **Hash checks, honestly** | SHA-256 of the whole file plus salted hashes per field, checked against an Ed25519-signed registry. A match is not legal validity. |
| **Every value shows its source** | Issuer-verified, user-uploaded or user-corrected. OCR readings stay unconfirmed until the owner confirms them. |
| **Readiness per purpose** | Rules return pass, fail or unknown with reasons, relative to the receiver's purpose, not a fixed colour by age. |

| Trust tier | Meaning | How it looks |
|---|---|---|
| **Issuer-verified** | Signature valid, and the fingerprint or fields match the issuer's registry | solid badge |
| **User-uploaded** | Stored, but not (yet) verified | outlined badge |
| **User-corrected** | Your correction, layered beside the original with its provenance | dashed badge |

Tiers are **computed** from what happened (verification events and assertions), never declared by data.
**No AI model makes any decision**: verification, readiness, eligibility, matching, sharing and revocation are
deterministic code.

## 3. The demo cast and the six steps

Who is in the demo is set in one file, [`src/config/demo-cast.json`](src/config/demo-cast.json). Change a name there
and the sign-in, the greeting and the issuer and receiver areas follow.

| Role | Who | In the demo |
|---|---|---|
| **Issuer** | VIT University, Government Revenue Department | Issue Mahesh's certificates |
| **Sender** | Mahesh Mekhala, student | Keeps his documents, answers requests, shares only what is needed |
| **Receiver** | Google (`UV-R-2001`, purpose: job) | Asks Mahesh to answer its job criteria from his certificates |

**The live database starts empty.** Nothing appears until an issuer issues a document or the student uploads one.
Requests and alerts start at zero; the student's bell rings only when Google sends a request or VIT issues
something. The guided demo at [`/demo`](https://univault-zeta.vercel.app/demo)
([`src/config/demo-guide.json`](src/config/demo-guide.json)):

| # | Step | Sign in as | Screen |
|---|---|---|---|
| 1 | VIT issues a document | Issuer | `/issuer/issue` |
| 2 | Mahesh checks it with the issuer | Sender | `/verify` |
| 3 | Mahesh uploads a document of his own (PDF or photo) | Sender | `/add` |
| 4 | Google asks an eligibility question | Receiver | `/receive/eligibility` |
| 5 | Mahesh answers it, criterion by criterion | Sender | `/alerts` |
| 6 | Mahesh stops sharing and tests the link | Sender | `/shares` |

## 4. A walk through the product

Every picture below was taken by [`scripts/readme-shots.ts`](scripts/readme-shots.ts), which signs in and clicks
through the real app like a person would: it creates a real share, opens it as the receiver, traces the watermark
and answers a real eligibility request. It ran on the local in-memory test store, which is pre-filled with the
synthetic showcase vault, so some documents carry the synthetic name "Anil Mekala". The live demo starts empty.

### Sign in

Three roles in one list, "Signing in as Mahesh Mekhala", one Continue button, then a code and a consent step in the
same panel. The ID number is a synthetic Aadhaar-style number (it always starts 0000), shown masked after sign-in
and never stored in full. The code is shown on screen, labelled simulated.

| Sign-in (laptop) | Sign-in (phone) |
|---|---|
| ![Sign-in](docs/readme/01-signin.jpg) | <img src="docs/readme/29-phone-signin.jpg" width="300" alt="Sign-in on a phone"> |

### The issuer: VIT signs and sends a document

The issuer finds the person (only a masked demo ID is shown), picks a kind of document its office is allowed to
sign, fills the details, and signs. The record goes into the Ed25519-signed registry and the student is notified.

| Issuer dashboard | Issue a document, step 1 of 4 |
|---|---|
| ![Issuer dashboard](docs/readme/02-issuer-home.jpg) | ![Issue a document](docs/readme/03-issuer-issue.jpg) |

### The student: one calm home

A greeting with real counts; four "What do you want to do?" tiles; "Needs your attention" with at most three rows,
one per document title, never repeated; one "Ready for…" card with a purpose picker; the newest documents.

| Home | All documents, with filters |
|---|---|
| ![Home](docs/readme/04-home.jpg) | ![Documents](docs/readme/05-documents.jpg) |
| **One document: fields, source of each value, history** | **Add a document: PDF or photo** |
| ![Document](docs/readme/06-document.jpg) | ![Add](docs/readme/11-add.jpg) |

### Check, and get ready

| Check with the issuer | Ready for a purpose: pass, fail or unknown, with reasons |
|---|---|
| ![Verify](docs/readme/07-verify.jpg) | ![Readiness](docs/readme/08-readiness.jpg) |
| **Name detective: ranked matches, never auto-merged** | **OCR: the scan beside the fields, with confidence** |
| ![Names](docs/readme/09-names.jpg) | ![OCR](docs/readme/10-ocr.jpg) |

### Share only what's needed

The student picks who, what and for how long, then sees **exactly** what the receiver will see (with the watermark)
before anything is shared. Over-broad requests are flagged with a smaller choice: the last 4 digits instead of the
full ID number, or a signed yes/no fact such as "over 18".

| Review: exactly what they will see | Receipt: one personal link for one receiver |
|---|---|
| ![Share review](docs/readme/12-share-review.jpg) | ![Share receipt](docs/readme/13-share-receipt.jpg) |

### The receiver opens the link

The link opens only for the approved receiver ID, after a single-use one-time code (simulated). The page is plain
HTML with no scripts, and every view is watermarked with the receiver, the time and a session code.

| Gate: receiver ID + one-time code | The minimal, watermarked view |
|---|---|
| ![Recipient gate](docs/readme/14-recipient-gate.jpg) | ![Recipient view](docs/readme/15-recipient-view.jpg) |

### Trace a leak, and stop sharing

Paste the watermark text from a leaked screenshot and UNIVAULT names the receiver and the viewing session. Then stop
one link, one receiver or everything, and press "Test this link now" to see it refused.

| Leak trace: watermark → receiver + session | Who has access: counts, stop, test |
|---|---|
| ![Leak trace](docs/readme/16-leak-trace.jpg) | ![Shares](docs/readme/17-shares.jpg) |

### Ask for the answer, not the document

Google asks whether Mahesh meets its job criteria. Mahesh is notified, chooses which criteria to answer, and Google
gets met / not met / unknown for each, signed by UNIVAULT, with **no document shared**. Every step is shown and written
to the ledger.

| Receiver's inbox | Google asks: the criteria for its purpose |
|---|---|
| ![Receiver inbox](docs/readme/18-receiver-home.jpg) | ![Eligibility ask](docs/readme/19-eligibility-ask.jpg) |
| **Mahesh is notified** | **Answered: what the system did, step by step** |
| ![Alerts](docs/readme/20-alerts-request.jpg) | ![Eligibility answered](docs/readme/21-eligibility-answered.jpg) |

### Proof, and trust

| The ledger: verify the whole hash chain | Fault panel: switch on an issuer timeout and watch the response |
|---|---|
| ![Ledger](docs/readme/22-ledger.jpg) | ![Faults](docs/readme/23-faults.jpg) |
| **What UNIVAULT can do: honest status per feature** | **Demo guide: six steps, each with a Go button** |
| ![Features](docs/readme/24-features.jpg) | ![Demo guide](docs/readme/25-demo.jpg) |
| **Threat model: each threat, what stops it, what doesn't** | |
| ![Threat model](docs/readme/26-threat-model.jpg) | |

### On a phone, in English and Telugu

English and Telugu throughout, Text size (A- / A / A+), High contrast, keyboard-only use, and gentle motion that
switches off for people who ask for less. Telugu was written by an AI model and is not yet reviewed by a native
speaker: see [`docs/TELUGU_REVIEW.md`](docs/TELUGU_REVIEW.md).

| Home on a phone | The same screen in Telugu |
|---|---|
| <img src="docs/readme/27-phone-home.jpg" width="300" alt="Home on a phone"> | <img src="docs/readme/28-phone-home-te.jpg" width="300" alt="Home in Telugu on a phone"> |

More screenshots, before and after the latest redesign, at 1440, 768 and 390 px in both languages, are in
[`docs/screenshots/phase11/`](docs/screenshots/phase11/).

## 5. How it works: the flows

### How the data flows

```mermaid
flowchart LR
  I[Issuer<br/>publishes the record and its hashes<br/><i>simulated</i>] --> R[Signed registry<br/>Ed25519 entries + issuer authority]
  R --> V[Vault<br/>holds the original file<br/>never altered]
  V --> P[Share pipeline<br/>scope · preview · one link per receiver]
  P --> X[Receiver<br/>sees only the granted fields]
  I -.-> L[(Append-only ledger<br/>hash-chained; triggers block UPDATE and DELETE)]
  V -.-> L
  P -.-> L
  X -.-> L
```

Every fetch, correction, share, view and kill is written once to the ledger. Corrections are stored as the owner's
separate claim, beside the original, never on top of it.

### Verification

```mermaid
flowchart TD
  D[Document opened<br/>the stored original, byte for byte] --> H{1. File hash<br/>SHA-256 matches the registered hash?}
  H --> F{2. Field hashes<br/>each field, such as CGPA, matches its salted hash?}
  F --> S{3. Issuer status<br/>current, revoked or replaced?}
  S -- all match, current --> OK[Matches the issuer's record<br/>shown as issuer-verified, with the date checked]
  S -- a field differs --> NO[Does not match<br/>shown with the field and its source, in neutral words]
  H -. no reply in 8 s .-> U[Issuer unreachable<br/>marked unverified, still submittable; retries follow]
```

A hash match is not legal validity, and a mismatch is not proof of wrongdoing: only the issuer can settle either.
One altered digit is named exactly ("doesn't match the issuer's record… may be a scanning or typing mistake"); the
owner is never accused.

### Readiness

```mermaid
flowchart TD
  A[Document + purpose] --> B{Required for this purpose?}
  B -- no --> NN[Not on this purpose's checklist]
  B -- yes --> C{Issuer record current?}
  C -- no / unknown --> UN[Unknown<br/>issuer unreachable or record unclear]
  C -- yes --> E{Within the purpose's age rule?}
  E -- no --> FL[Fail<br/>with the reason, in plain words]
  E -- yes --> PS[Pass<br/>ready to submit]
```

Three-valued on purpose: unknown is never rounded up to pass, or down to fail. Rule packs are JSON files in
[`src/rules/`](src/rules/), so a new purpose needs no code. Examples (synthetic):

| Document | Purpose | Result | Why |
|---|---|---|---|
| Income certificate, 12 months old | Scholarship (6-month rule) | Fail | Issued 12 months ago; the rule allows 6 |
| Income certificate | Job application | Not on the checklist | The purpose does not ask for it |
| Degree certificate | Job application | Pass | Does not expire; issuer-verified |
| Driving licence | Overseas verifier | Unknown | Issuer unreachable; shown as unverified |

Name differences are confirmed per pair by the owner (Confirm / Reject); names are never merged automatically.

### Sharing

```mermaid
flowchart LR
  subgraph Before["Before the link goes out"]
    A1[1. Ask or offer<br/>the owner can grant less than asked] --> A2[2. Choose the scope<br/>single fields, or a yes/no fact]
    A2 --> A3[3. Preview exactly<br/>what the receiver will see, then confirm]
  end
  A3 --> K[Link created<br/>bound to one receiver ID · one-time code · tiled watermark]
  subgraph After["After the link goes out"]
    K --> B1[4. Receiver gate<br/>only that ID, after the code]
    B1 --> B2[5. View logged<br/>the owner gets a receipt]
    B2 --> B3[6. Kill or trace<br/>one link, one receiver, or all; then test]
  end
```

**A share's states** (each step is a separate append-only event plus a ledger line):

```mermaid
stateDiagram-v2
  [*] --> drafted
  drafted --> previewed: you see the exact recipient view
  previewed --> confirmed: you confirm (idempotency key: a retry never makes a second share)
  confirmed --> active: 256-bit link issued, only its SHA-256 stored
  active --> revoked: you kill it, or the document is erased
  active --> expired: expiry time passes (30 days at most)
  revoked --> [*]
  expired --> [*]
```

**What happens when a link is opened:**

```mermaid
flowchart LR
  L[/s/link/] --> A{link live?}
  A -- killed / revoked / expired --> D1[Access denied<br/>logged + owner notified]
  A -- yes --> B{approved recipient ID?}
  B -- no --> D2[denied, logged,<br/>owner notified]
  B -- yes --> C{fresh one-time code?<br/>single use, 10 min}
  C -- no --> D3[denied, logged,<br/>owner notified]
  C -- yes --> V[minimal view + watermark<br/>recipient · code · time · session]
  C -- 5th wrong in a row --> K[locked 15 min, 429<br/>owner notified]
  V -. new device .-> N[owner notified]
```

### Kill and trace

```mermaid
flowchart LR
  C[A copy turns up<br/>somewhere it shouldn't be] --> S[Open the share log<br/>every link, receiver and view]
  S --> W[Match the watermark<br/>the tiled mark points to one link and session]
  W --> K[Kill it<br/>this link, this receiver, or everything]
  K --> T["Test this link now"<br/>see with your own eyes that it is refused]
  T --> L[(The kill is logged too<br/>same ledger, who and when)]
```

Killing a link stops future access. It cannot recall a copy already downloaded, so we trace it instead, and say so plainly.

## 6. Trustworthy under failure

| Situation | What UNIVAULT does |
|---|---|
| **Hostile files** | Text inside a document is data, never instructions. The assistant only proposes; it cannot share on its own. Hidden "share everything" text is flagged and nothing changes. |
| **Wording about mismatches** | Neutral language only. The owner is never accused; the mismatch is shown with the field and its source. |
| **Issuer outage** | Submission still works, clearly labelled unverified ("issuer unreachable at HH:MM, retrying"), retried at 10/30/60/120 s. Nothing pretends to be checked. |
| **Other injected faults** | Stale data, a malformed upload, a conflicting issuer update and lost connectivity each have a defined response and recovery, switchable live at `/faults`. |
| **No leaks in logs** | All logging goes through a scrubber; an automated test checks that no sensitive field appears in logs or share URLs. |
| **Guessing codes** | 5 wrong codes in a row lock the link for 15 minutes (even against the right code) and alert the owner. |

## 7. What it does, mapped to the brief

| Brief requirement | How UNIVAULT meets it | Where |
|---|---|---|
| Real documents in, originals kept | Upload a PDF (its text is read on the server) or a photo (read in the browser with OCR, shrunk to 1600 px). The original file is kept (up to 700 KB) and can be opened from the document page | `/add`, `src/lib/read-fields.ts`, `/api/upload/*` |
| ≥15 planted conflicts + data card | 17 planted conflicts in a generated showcase vault, plus 2 × 1,380 generated test documents (testing only; never loaded into the live demo by default) | `synthetic/`, `docs/DATA_CARD.md` |
| Explicit state machines | Document, share and token states are separate; each transition is an event row plus a ledger line | `src/lib/shares.ts`, `share-store.ts` |
| Reason, confidence, source, freshness, override/escalate on every output | One shared `<Explain>` component on every automated result; overrides and disputes are append-only ledger lines | `src/components/Explain.tsx` |
| Survive injected faults | Issuer timeout, stale data, malformed upload, conflicting issuer update, connectivity loss, each with a defined response and recovery | `/faults`, `e2e/journey.e2e.ts` |
| Keyboard, screen reader, English + Telugu, low bandwidth | Skip link, visible focus, live region, Telugu for every screen, script-free recipient page | `e2e/` |
| Scripted tests with pass rate and precision/recall | 362 unit tests, 334 browser tests, evaluation harness on dev and held-out sets | `tests/`, `e2e/`, `eval/` |
| Tamper-evident audit log | Hash chain computed by a database trigger; `verify_ledger()`; edits and deletes refused (tested live) | `/ledger`, `docs/sql/001` |
| Declarative readiness, pass/fail/unknown | Rule packs are JSON files; a new purpose needs no code | `src/rules/*.json`, `/readiness` |
| Eligibility answer instead of documents | The receiver asks; the student allows criteria one by one; missing, expired, conflicting or unverified evidence is always "unknown"; the signed answer says it is not proof and gives no document | `/receive/eligibility`, `/alerts` |
| Entity resolution that never auto-merges | Initials, word order, Telugu↔English spelling; ranked with reasons; Confirm/Reject only | `/names` |
| OCR with confidence, side-by-side view, corrections as assertions | Tesseract.js (eng+tel); the original reading is never changed | `/ocr` |
| Field-level selective disclosure + recipient preview | The exact recipient view before confirming; signed yes/no attestations ("over 18") | `/share` |
| Consent ledger with purpose, fields, recipient, expiry, access count | Every attempt (allowed or denied) goes to `access_log` **and** the ledger | `/shares`, `/ledger` |
| Verifiable revocation, with its limits stated | Stop one link, one receiver or everything, then "Test this link now"; "copies already downloaded can't be recalled" | `/shares` |
| Elite: per-recipient tokens and watermarks; trace and kill a leak | 256-bit links stored only as SHA-256; watermark shows recipient · code · time · session; leak trace | `/s/[token]`, `/leak-trace` |
| Elite: issuer re-check, notify, list affected shares | A scheduled server-side run once a day (Vercel Cron, protected by `CRON_SECRET`), plus "Re-check now" and a 60 s poll while `/shares` is open. Revoked, changed or expired → one alert per change; issuer down → "unknown", never failed | `src/lib/recheck.ts`, `/api/cron/recheck` |
| Brute-force resistance | 5 wrong codes in a row lock the link for 15 min and alert the owner; 60 requests/min per address, 20 per link → 429 | `src/lib/rate-limit.ts`, `tests/lockout.test.ts` |
| Threat model and policy, backed by code | `/threat-model`: 14 threats, what stops each, what does not, and the code and test files behind it. `/policy`: what is stored, erased, kept and for how long | `/threat-model`, `/policy`, `tests/trust-pages.test.ts` |
| Curveball: one altered digit | Names the exact field: "doesn't match the issuer's record… may be a scanning or typing mistake" | `/verify` |
| Curveball: hidden text tells the assistant to share everything | The assistant only proposes and cannot share; the hidden text is flagged; ledger and share counts unchanged | `/assistant` |
| Curveball: over-broad request | Flagged, with a one-click minimal alternative | `/share` |
| Curveball: issuer down | "Unverified: issuer unreachable at HH:MM, retrying", never shown as a mismatch | `/verify` |
| OCR never authoritative | Unconfirmed OCR values can't pass a rule and are **withheld from shares** | `src/lib/disclosure.ts` |
| Nothing sensitive in links, URLs or logs | Log scrubber with tests; links carry only a random token; no analytics; telemetry off | `src/lib/scrub.ts` |
| Erasure and its limits | Limits shown first; content deleted; active shares revoked; fingerprint and times kept | document page → "Erase this document…" |

## 8. Architecture

| Layer | What runs there |
|---|---|
| **Interface:** Next.js on Vercel | Owner, issuer and receiver views. Accessible, and built to work on a slow connection. |
| **Rules and checks** | Readiness rules, hash verification, eligibility and share scope, all enforced on the server, never in the browser. |
| **Data:** Supabase Postgres | Immutable originals, append-only ledger, and triggers that block UPDATE and DELETE. |
| **Issuer side:** simulated | A mock issuer plus an Ed25519-signed registry of records and issuer authority. |

```mermaid
flowchart LR
  subgraph Browser
    O[Student, issuer and receiver pages]
    R[Recipient page /s/token<br/>plain HTML, no JavaScript]
    T[Tesseract.js OCR for photos<br/>eng + tel]
  end
  subgraph Server["Next.js on Vercel (Node.js runtime, region bom1)"]
    M[Middleware<br/>role gate · 256 KB body limit, 1 MB on uploads]
    P[PDF text reader<br/>unpdf]
    E[Deterministic engines<br/>rules · names · verify · shares · eligibility · leak trace]
    I[SIMULATED ISSUER<br/>Ed25519-signed registry]
  end
  subgraph DB["Supabase Postgres (RLS: read + append only)"]
    A[(documents · events · assertions<br/>shares · tokens · access_log)]
    L[(ledger<br/>hash chain by trigger)]
  end
  O --> M
  R --> M
  M --> P
  M --> E
  T --> O
  E --> I
  E --> A
  E --> L
  A -. Realtime: access_log .-> O
```

**The database enforces the rules, not just the app.**

- **Two layers stop edits.** Row-level security gives the app's public key no UPDATE or DELETE rights on any
  history table, so an edit or delete changes **0 rows** (tested against the live database on 13 tables). Behind
  that, a trigger refuses UPDATE and DELETE even for privileged roles (`Table ledger is append-only: UPDATE is not allowed`).
- **The chain is computed by the database.** The ledger works out each line's fingerprint, and the previous
  line's, in a BEFORE INSERT trigger. `verify_ledger()` re-checks the whole chain.
- **Two writes are allowed, by design:** deleting a document's *content* (that is how erasure works) and
  flipping the simulated issuer's on/off switch.
- **Forgery is caught.** Registry entries are signed, so a forged entry fails verification.
- **OCR is the only machine-learning part**, and its output stays *unconfirmed* until a person confirms it.
- **Roles are enforced on the server.** A signed (HMAC) session cookie carries the role; the middleware refuses
  another role's pages and APIs (for example, a receiver calling an issuer API gets 403).

## 9. Results

**Tests** (latest run, 2026-10-25). Browser tests run against an in-memory copy of the store
(`UNIVAULT_FORCE_OFFLINE=1`), so they never write to the demo database.

| Check | Result | Command |
|---|---|---|
| Unit, property, metamorphic, oracle, anti-hardcoding, wording and source-scan tests | **362 passed** (39 files) | `npm test` |
| Browser tests in Edge | Full run: **326 passed, 8 failed**. All 8 were axe checks on `/demo` (a button's spoken name didn't match its text); after the fix they pass on re-run, but the full suite has not been re-run since | `npx playwright test` |
| Accessibility (axe-core, WCAG 2.1 A/AA) | Every page in `e2e/a11y.e2e.ts`, for all three roles, in English and Telugu, normal, larger text and high contrast: **0** violations after the `/demo` fix | `e2e/a11y.e2e.ts` |
| Journey | upload → OCR fix → verify → readiness → confirm a name link → 2 shares → wrong ID, wrong code, right code → owner alert → trace watermark → kill one → kill all → ledger OK | `e2e/journey.e2e.ts` |
| Faults | each fault on → the screen says what happened → off → recovers | `e2e/journey.e2e.ts` |
| Lockout | 4 wrong codes → 403; 5th → 429 + Retry-After ≈ 15 min; the right code is then refused; owner gets "share_locked" | `e2e/share.e2e.ts` |
| Navigation and sign-in | role list by keyboard alone; Home has at most 3 attention rows, never the same title twice; every `/features` and `/demo` link opens a real page; the tour shows once and can be reopened | `e2e/phase11.e2e.ts` |
| Slow 3G (≈400 kbit/s, 2 s latency) | Student home **247 KB, 9.8 s** in English and **383 KB, 12.5 s** in Telugu. The target (169 KB, 7.2 s) is **not met**. The recipient page was 3.4 KB with 0 scripts when last measured | `e2e/slow3g.e2e.ts` |
| Dependencies | `npm audit`: 0 vulnerabilities (last run in Phase 6) | `npm audit` |

**Live database checks** (run on 2026-10-24, on the earlier test data)

| Check | Result | Command |
|---|---|---|
| Connectivity, ledger append, chain verify | all pass; `verify_ledger()` → `ok: true, broken_at: null` | `npm run db:check` |
| Tamper test with the app's key | UPDATE + DELETE tried on 13 history tables: all refused, every row unchanged, chain still verifies | `tests/live-db.test.ts` |
| Health | `{"ok":true,"db":"up"}` | `GET /api/health` |

**Detection on generated data** (`npm run eval`): 1,380 documents per set, 800 cases. Tuning used the dev
set only; the held-out set (seed 99) was not used for tuning.

| Category | Dev precision | Dev recall | Held-out precision | Held-out recall | False alarms (dev / held-out) |
|---|---|---|---|---|---|
| Names | 100% | 100% | 100% | 99.2% | 0 / 0 |
| Dates | 100% | 100% | 100% | 100% | 0 / 0 |
| Tampering | 100% | 100% | 100% | 100% | 0 / 0 |
| OCR review hints | 100% | 81.4% | 100% | 72.5% | 0 / 0 |
| Issuer state | 100% | 100% | 100% | 100% | 0 / 0 |
| Duplicates | 100% | 100% | 100% | 100% | 0 / 0 |
| Injection | 100% | 100% | 100% | 100% | 0 / 0 |
| Over-broad requests | 100% | 100% | 100% | 100% | 0 / 0 |
| Sharing (access, notifications, expiry, kill, revoke) | 100% | 100% | 100% | 100% | 0 / 0 |
| **All evaluated cases** | **100%** | **97.8%** | **100%** | **96.6%** | **0 / 0** |

Negative controls: 20 documents per set should raise no alarm, and none did.
**Showcase vault: 17 of 17 planted conflicts detected.**

**Where it fails (held-out, 20 misses):**

- **OCR, 19 misses:** digit confusion 4, heavy noise 4, mild blur 3, skew 3, low contrast 3, mixed script 1, Telugu conjuncts 1.
  These are misreads where Tesseract is confident and wrong: 10% of fields read with confidence ≥ 0.85
  were misread. That is why no OCR value counts until a person confirms it.
- **Names, 1 miss:** a name pair in Telugu script, scored 0.603 (below the "likely same" threshold).

## 10. Security

- **No secrets in git.** Only `.env.example` (names, no values) is tracked. Signing keys live only in local
  `.env.local` and in Vercel's environment settings.
- **Input validation.** Every API route and the recipient form validate input with Zod. Error replies name the
  field that was wrong, never its value.
- **Uploads.** Only PDF, JPEG and PNG are accepted, checked by their first bytes and not only their name, up to 700 KB.
- **Size limits.** A POST over 256 KB (1 MB on the upload routes) is refused (413) before any route reads it.
- **Slow-down.** Recipient pages allow 60 requests a minute per address and 20 per link (429 past that).
- **Scheduled job.** `/api/cron/recheck` runs only with `Authorization: Bearer <CRON_SECRET>`, compared in
  constant time; without the variable set it refuses every call.
- **Headers.** Content-Security-Policy, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (share links
  contain a secret) and `X-Content-Type-Options: nosniff`.
- **Fails safe.** A production deploy without a database shows "Database not configured". It never falls back
  to a temporary in-memory store.
- **Logs.** All logging goes through a scrubber; there are no `console.log` calls with personal data.

## 11. Honest status and limits

| Built and live | Not yet |
|---|---|
| Vault with immutable originals and the ledger | Share wizard's preview-pages mode |
| Real uploads: PDF text and photo OCR, original kept | Checking a PDF someone else sent you against the issuer's record ("verify a copy") |
| Verification, readiness and name matching | Slow 3G target (169 KB, 7.2 s) |
| One sharing pipeline with three kill levels | Native-speaker review of the Telugu wording |
| Eligibility answers instead of documents | Issuer-level suspend |
| Issuer, Sender and Receiver roles, UV-IDs, issuer authority | Database lock-down script, ready but not run by the owner |
| Public repo (MIT) and a deployed app | |

**Limits, said plainly**

- **Simulated organisations.** No real government, university, employer or DigiLocker connection.
- **The public database key can still read every table** until the owner adds a server-only key
  (`SUPABASE_SERVICE_ROLE_KEY`) and runs `docs/sql/004_lock_anon.sql`. Until then the vault is not private from
  someone who queries the database directly. `npx tsx scripts/anon-probe.ts` shows exactly what is readable.
- **Attestation, not zero-knowledge.** UNIVAULT sees your full data and signs statements like "over 18 = yes".
  The receiver trusts that signature and cannot check the fact independently.
- **Screenshots cannot be prevented.** The watermark only tells you *whose* screenshot it was.
- **Revocation can't recall copies.** Stopping a link stops access, but a downloaded copy stays downloaded.
- **A scanned PDF has no text to read.** The page says so; take a photo instead or type the details.
- **Uploads are small:** the original file is kept only up to 700 KB.
- **Rate limits are per server instance.** The per-minute counters live in memory, so on Vercel each instance
  counts on its own. The 15-minute lock after 5 wrong codes is stored in the database, so it holds everywhere.
- **OCR is unconfirmed** until you confirm it, and it can be confidently wrong (see the misses above).
- **The one-time code is shown on screen** (labelled SIMULATED) instead of being sent by SMS or email.
- **The scheduled issuer re-check runs once a day** (the most the Vercel Hobby plan allows). Nothing is revoked automatically.
- **Overrides and disputes** are recorded but do not change decisions.
- **Telugu name matching** was tuned on generated names. It is not a general transliteration engine.

## 12. Built on top, not a clone

| | Answers |
|---|---|
| **DigiLocker** | *Is this document genuine?* It stores and issues documents from verified issuers. |
| **UNIVAULT** | *Am I ready for this purpose? What exactly goes out? Where did it go, and can I stop it?* |

DigiLocker proves a document is genuine. UNIVAULT proves you're ready, shares only what's needed, and lets you see
and stop where it went. In this prototype the issuer, identity check and one-time codes are simulated: there is no
real DigiLocker, Aadhaar or government integration.

## 13. What's next

*Plans, not claims: none of the pilot or real-issuer work exists yet.*

- **Close the gaps:** finish preview-pages mode, hit the Slow 3G target, run the database lock-down, and get the
  Telugu reviewed by native speakers.
- **Pilot:** try it with one college and one scholarship body, using synthetic and then consented data.
- **Real issuers:** replace the simulated issuer with real issuer APIs behind the same signed-registry interface.

**Business hypotheses** (to test, not results): free for individuals; per-check or per-seat pricing for receiving
organisations; an issuer-integration fee for institutions publishing signed registries. Start with university
placement cells: one institution onboards a whole graduating batch, and employers reached through student requests
then adopt the receiver side.

## 14. Run it locally, or deploy

```bash
npm install
cp .env.example .env.local        # fill in the values (names in DEPLOY.md)
npm run dev                       # http://localhost:3000
```

```bash
npm run seed            # adds only the demo cast's receiver (Google); the vault starts empty
npm run seed -- --set showcase   # the old synthetic showcase dataset, for testing only
npm run db:check        # live database check: append, verify_ledger()
npm test                # unit tests
npm run eval            # precision/recall/false alarms on dev and held-out, plus the 17 showcase conflicts
npm run synth:all       # regenerate the synthetic test datasets (dev 7, held-out 99, showcase 2026)
npm run build && npx playwright test   # browser tests in Edge, on the in-memory store
```

**Retaking the README pictures** (the script writes data, so it only ever runs against a local in-memory copy):

```bash
npm run build
UNIVAULT_OFFLINE_DEMO=1 UNIVAULT_FORCE_OFFLINE=1 npx next start -p 3400   # in one terminal
npx tsx scripts/readme-shots.ts                                         # in another; writes docs/readme/
```

Without a database key, or with `UNIVAULT_FORCE_OFFLINE=1`, the app uses an in-memory **offline store** with the
same append-only rules and hash chain. A production build refuses to do that. `GET /api/health` returns
`{ ok, db, time }` and nothing else.

**Emptying the demo database** is an owner-only step (the app's key cannot delete history): see
[DEPLOY.md](DEPLOY.md) section 4. **Deploying to Vercel:** also in [DEPLOY.md](DEPLOY.md).

## 15. Open-source credits

| Library | Version | Licence | Used for |
|---|---|---|---|
| Next.js | 15.5 | MIT | App framework |
| React / React DOM | 19 | MIT | UI |
| @supabase/supabase-js | 2 | MIT | Database client and Realtime |
| Zod | 4 | MIT | Input validation at every boundary |
| Tesseract.js (+ `eng`, `tel` tessdata) | 6.0 | Apache-2.0 | Reading text from photos |
| unpdf | 1.8.1 | MIT | Reading text from PDFs, on the server |
| lucide-react | 1.51 | ISC | The one icon set |
| motion | 13.5 | MIT | A few spring animations (loaded only on laptop-size screens) |
| Inter, JetBrains Mono, Noto Sans Telugu (via `next/font`) | — | SIL OFL 1.1 | English text, codes and IDs, Telugu text |
| sharp | 0.35 | Apache-2.0 | Rendering the synthetic scan images (dev only) |
| Vitest | 5 | MIT | Unit tests |
| Playwright (@playwright/test) | 1.64 | Apache-2.0 | Browser tests and screenshots |
| axe-core + @axe-core/playwright | 4.14 | MPL-2.0 | Accessibility checks |
| TypeScript, tsx | 6.0, 4 | Apache-2.0, MIT | Language and script runner |

Node's built-in `crypto` provides SHA-256, HMAC and Ed25519. There are no paid APIs, analytics or trackers.

**AI tools used: Claude** (Anthropic) was used as a coding assistant under the team's direction. The team
reviews, tests and can explain every part. **No AI model runs inside the product.**

## 16. Team

**Team SPACEX** · VIT-AP University · **IMPACTX 2026** · Challenge 02 "Your Documents, One Place"

| Member |
|---|
| Supreth S |
| Sushanth K |
| Mukesh R |
| Sree Ganesh SP |
