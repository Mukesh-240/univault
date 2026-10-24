# PHASE 10 (FINAL, all in one): fix the look, the logo, the text size, the fonts, and show every internal step

Read this whole file, then work through it in order. Presentation only: do not change verification, rules, ledger, share, kill or database logic. Time is short (the hackathon is on now), so the order below is the priority order. Commit after each part.

## 0. Before you start
1. Read `HANDOFF.md`, `git log --oneline | head -15`, `docs/GAP_AUDIT.md`, `docs/DESIGN.md`. Do not redo finished work.
2. Update `HANDOFF.md` after each part (what changed, what is untested).
3. Standing rules still apply: no hardcoded outputs, no persona/serial/synthetic-flag branching, no LLM in any decision, no real Aadhaar/DigiLocker/RTO claims, banned sentences stay banned ("secure cloud storage", "100% true", "no fake accounts", "zero-knowledge", "prevents screenshots", "recalls downloaded copies", "identity percentage"). Say "English", not "Latin". Never print keys. Never run mutating e2e against the live site without telling me.
4. Owner's complaints, in his words: the text is too big, the UI looks bad, the logo is different and wrong, and every internal step must be clear.

## 1. Logo (P1): use MY file, do not redraw it
The owner's logo is `../univault logo.jpeg` (one level above the repo, in the SPACEX folder; 3919 x 3919 px JPEG). It is a blue folder with papers sticking out of the top and a white padlock on the front. The padlock's keyhole is shaped like the letter U with a navy dot. The colours are blue `#1E88FE`, light blue `#6EB7FC`, navy `#0B3A8C`.
The SVG you drew in Phase 8 (`src/components/Logo.tsx`, `public/brand/logo.svg`, `src/app/icon.svg`) is WRONG. Delete it and use the real artwork.

Do this:
1. Copy the JPEG into the repo as `public/brand/source/univault-logo.jpeg` (keep the original untouched).
2. With `sharp` (or a short script in `scripts/`), produce from it: crop to the artwork with a small margin; remove the near-white background to make a **transparent PNG**; export `public/brand/logo-512.png`, `logo-192.png`, `logo-64.png`, `logo-32.png`; `src/app/icon.png` (favicon), `src/app/apple-icon.png` (180), and a social card `public/brand/og.png` (1200 x 630, logo + "UNIVAULT" + the line "Don't ask for the document. Ask for the answer."). Check the edges: no white halo on a navy background and none on a light one. Do not recolour or re-draw the artwork.
3. `Logo.tsx` becomes a thin component that renders the PNG with `next/image` (width/height set, `alt="UNIVAULT"`, priority only in the header). Wordmark "UNIVAULT" beside it in the brand navy; the header lockup is logo 36 px + wordmark. Sign-in hero uses the 192 px version.
4. Remove every other place the old logo or a shield icon stands in for the brand (`Chrome.tsx` currently shows a shield). Search for `Logo`, `shield`, `logo.svg`.
5. Add the logo to: header, sign-in, receiver page `/s/[token]` (small), PDF/print views if any, the README top (use the PNG), and metadata/OpenGraph.
6. Test: `tests/brand.test.ts` checks that the files exist, are PNG, have the expected sizes, and that no `logo.svg` or drawn `Logo` markup remains. Screenshot the header on both the navy header and a white page.

## 2. Text size (P2): the base is too big
Today `html { font-size: 125% }` makes the base text 20 px, and headings reach 29 px. That is why the app looks shouty. Change the scale:

| Token | Now | New |
|---|---|---|
| Base (body) | 20 px | **16 px** (`html { font-size: 100% }`) |
| Small/meta | 18 px | 14 px |
| h1 | 36 px | 28 px |
| h2 | 32 px | 22 px |
| h3 | 28 px | 18 px, weight 600 |
| Buttons | 48+ px high, 20 px text | **44 px high**, 16 px text, weight 600 (not 800) |
| Header | tall, 6 controls | 56 px high |

Rules:
1. Weights: body 400, labels 500, buttons and headings 600, almost never 700 or 800. Today nearly everything is bold; that is a big part of the "too big" feeling.
2. Line height 1.5 for English, **1.7 for Telugu** (Telugu glyphs need it). Line length under 70 characters.
3. The A- / A / A+ control stays, but re-base it: **A = 16 px (default), A+ = 18 px, A++ = 20 px** (the old default). Cookie `uv_size` keeps working; migrate old values (100 -> A+... choose so a user who picked big stays big). Label the control "Text size" with a visible current value.
4. Keep touch targets at 44 px minimum, focus ring visible, contrast tests green (`tests/contrast.test.ts`), no horizontal scroll at 360 px at every text size, Telugu wraps without overflow.
5. Update the screenshot script and the e2e overflow checks for the new sizes.

## 2b. Fonts (P2): pick one proper system and use it everywhere
The current text uses the system font until 1024 px and Inter after load, which looks inconsistent and cheap. Replace with this exact set, self-hosted through `next/font` (no request to Google at runtime, which also fits our privacy story):

| Use | Font | Notes |
|---|---|---|
| UI and body, English | **Inter** (variable, `latin` subset, weights 400-600 only) | Best readability for forms and data screens. Turn on `font-feature-settings: "cv11", "ss01", "tnum"` for clear digits (tabular numbers in tables, counters, dates). |
| Telugu | **Noto Sans Telugu** (variable, weights 400-600) | Load ONLY on Telugu pages (`te`), `display: swap`, no preload on English pages. Keep line height 1.7. Fallback stack: `"Nirmala UI", "Kohinoor Telugu", system-ui`. |
| Codes, hashes, UV-IDs, share codes, ledger lines | **JetBrains Mono** (or `ui-monospace` if it blows the budget), weight 500, 14 px | Never for sentences. |
| Brand wordmark "UNIVAULT" | Inter 700, letter-spacing 0.04em, brand navy | Only place weight 700 is allowed, plus the logo lockup. |

Rules:
1. One font stack variable in `globals.css`: `--font-ui`, `--font-te`, `--font-mono`. Delete the old Inter loader (`InterLoader.tsx`) and every ad-hoc `font-family`.
2. Zero layout shift: use `next/font`'s fallback metric adjustment (`adjustFontFallback`) so the swap does not move text. Prove it with a screenshot diff or a CLS reading.
3. Weights: body 400, labels and chips 500-600, buttons and headings 600. No 800.
4. Check contrast again after the font change (`tests/contrast.test.ts`), check Telugu conjuncts render without clipping at 16, 18 and 20 px, and check that numbers do not jump when they change (tabular numbers).
5. Performance: report the font bytes added on English pages and on Telugu pages, and the Slow 3G vault numbers with the new fonts. If Inter plus the page misses the old budget, subset harder or drop the 500 weight before dropping the font. Report the real numbers; do not claim a target that was not measured.
6. Do not use any font that needs a licence, a CDN link, or a download at runtime.

## 3. Layout and look (P3): make it look designed, not generated
The Phase 7 screen has a 12-link side menu, huge cards, a floating "Need help?" that covers the search box, and a flat wall of bold text. Redo the shell and the three main screens. Keep the palette tokens from `PHASE8.md` / `src/lib/palette.ts` (logo blue as the single accent). Write the direction in two sentences in `docs/DESIGN.md` first. Reference feel: DigiLocker-like (calm, white cards on a light grey-blue background, one blue action colour, plenty of white space, thin borders, soft shadow, small icons).

1. **Spacing scale** 4 / 8 / 12 / 16 / 24 / 32 only. Cards: 12 px radius, 1 px border, 16 to 24 px padding, no nested card-in-card.
2. **Header**: 56 px, white or the brand navy (pick one and check the logo on it), logo left, then on the right: search icon, language toggle (compact), text size (icon + current value), bell with count, profile menu. On phones collapse language/text size/profile into one menu.
3. **Side menu** (desktop): at most 6 entries for the sender: My documents, Am I ready?, Share, Requests and alerts, Activity (ledger, leak trace), More. Everything else (Scan and fix, Same person, Check with issuer, History, Helper, Demo, Threat model, Policy) goes under "More" or inside the page it belongs to. Role menus for Issuer and Receiver the same way (max 5 plus More). Active item: filled soft-blue pill.
4. **Home**: one-line greeting (not a 29 px headline), a compact "Am I ready?" row of three cards (ring + one short sentence + a text link), then "My documents" as a clean list/table: icon, title, issuer, status chip (icon + text), date, a row action menu. Filter chips and search on one line. Pagination or "Show more" at 12 rows.
5. **"Need help?"**: smaller; sits above the phone tab bar; after the first view it shrinks to a `?` icon; it must never cover a field or button (test at 360 px and at A++).
6. **Chips/badges**: 13 to 14 px, weight 600, 24 px high, icon + text. **Empty, loading, error states** are designed (one line, one action).
7. **Synthetic strip**: keep it, make it 28 px high and calm (it must stay on every page).
8. Apply the same system to: Document, Am I ready?, Share wizard, My shares, Alerts, Issuer dashboard and issue wizard, Receiver inbox/ask/viewer, Sign-in, recipient page `/s/[token]`.
9. **Names page**: it renders about 3,200 buttons and is slow (this probably causes the failing keyboard test "scan and fix a field"). Show the top 20 ranked pairs with "Show more", virtualise or paginate, and check the keyboard test passes. If the cause is something else, find it and say what it was.
10. Self-critique loop (same rubric as `docs/DESIGN.md`: beauty, clarity for an older user, contrast, trust), two rounds per page, honest note that it is self-assessed. Put before/after screenshots in `docs/screenshots/phase10/` at 1440, 768 and 390 px, English and Telugu.

## 4. Every internal step must be visible and clear (P4): the most important part
Judges and users must SEE what the system does at each step, in plain words. Add one reusable pair of components and use them on every flow below. All content is built from the REAL results and events (verification result, ledger lines, access log, rule results), never from canned text, and never branching on a persona, serial or the synthetic flag.

### 4.1 `<Stepper>` (where am I)
At the top of every multi-step flow: "Step 2 of 4: Choose what to share", with the done steps ticked, the current step highlighted, the next steps greyed. Under the title, two short lines: **What happens here** and **What happens next**. Keyboard and screen-reader friendly (`aria-current="step"`, `<ol>`). Same words in Telugu.

### 4.2 `<StepTrail>` (what just happened, step by step)
After every action that does work, show a short ordered list of the internal steps that really ran, each with status (done / skipped / failed / waiting), plain wording, and the evidence link or id where there is one (ledger line number, verification time, share code). Example for "Verify a document":
1. Read the stored fingerprint of the file: done.
2. Checked the issuer's signature on the registry entry: valid.
3. Compared each field with the issuer's record: all 6 match (or: "Date of birth does not match the issuer's record; this may be a scanning or typing mistake").
4. Asked the issuer for the current status: valid, checked 10:42.
5. Wrote the result to the ledger: line 214 (link to `/ledger`).
Each step has a one-line "why we do this" on tap/expand. Failure and waiting steps say what happened, what the system does next (for example "Issuer did not answer in 8 s. Retrying in 10 s. Retry now"), and what the user can do. Never accuse; neutral wording only. Never show a sensitive value inside the trail.

### 4.3 Flows that MUST have both components (build in this order, stop and commit after each)
| # | Flow | Steps to surface (derive them from the real code paths) |
|---|---|---|
| 1 | **Share (owner)** | Choose recipient and purpose -> choose documents/fields and mode -> preview (what the recipient will and will not see, over-broad warnings) -> confirm -> receipt. Trail after confirm: re-verified each document, built the minimal attestation, created the per-recipient link (hash stored, not the link), wrote ledger line, notified recipient. |
| 2 | **Open a shared link (receiver)** | Link opened -> identity check (UV-ID) -> one-time code (SIMULATED label) -> view. Trail on every outcome: allowed, wrong code (attempts left), locked (until when), forwarded to the wrong account, expired, killed. Plain reason each time. |
| 3 | **Issue a document (issuer)** | Pick type (only the issuer's authorised types) -> fill fields -> review paper -> sign -> delivered. Trail: authority check, canonical values, salted field hashes, Ed25519 signature, registry entry written, delivered through the normal intake, ledger line. |
| 4 | **Verify / re-check** | See 4.2 example. Include the fault wording (issuer unreachable, stale, superseded) and the retry schedule. |
| 5 | **Stop sharing (kill link / user / all)** | Choose scope -> confirm with the consequence in words ("Downloaded copies cannot be recalled") -> done. Trail: tokens marked killed, ledger line, "Test this link now" result (denied), receiver notice sent (neutral). |
| 6 | **Request and eligibility (receiver and sender)** | Ask -> owner reviews (grant less / decline) -> result. Each criterion: met / not met / unknown with the reason and which document it used. State that consent to evaluate does not give document access. |
| 7 | **Sign-in** | Enter demo number -> code on screen (SIMULATED) -> consent -> in. Say plainly that it is a demo and nothing real is contacted. |
| 8 | **Scan and fix, Same person?, Erase** | Same pattern: what the machine read, how sure it is, what you change, what is recorded, what cannot be undone. |
| 9 | **Leak trace** | Paste text -> match -> who, when, which session; say the watermark traces and cannot stop screenshots. |

### 4.4 Extra clarity rules
1. Every button names its result ("Share with Infosys HR", not "Submit"); disabled buttons say why.
2. Long operations show progress text, not just a spinner.
3. Every automated result keeps the `<Explain>` pattern (reason, confidence, source and freshness, Correct, Dispute) and links to its trail.
4. A small **"Under the hood"** disclosure on the main flows shows the technical names for judges (SHA-256, Ed25519, salted field hash, hash-chained ledger line N), collapsed by default, with a one-line plain meaning beside each.
5. Telugu parity: every new key in `en.json` and `te.json` together; parity test must pass; list the new phrases in `docs/TELUGU_REVIEW.md` (still AI-written, not native-reviewed; do not claim otherwise).

## 5. Tests and proof (P5)
1. New tests: `tests/brand.test.ts`; unit tests that `StepTrail` is built from result objects (feed it a failing verification and a passing one, check different steps appear; feed the same data with the synthetic flag flipped, check identical output); e2e that each flow in 4.3 shows the Stepper and a trail with at least the expected number of steps; axe on all pages at 100 %, A+, A++ and high contrast; 360 px no sideways scroll; keyboard-only walk of the share wizard and the issue wizard.
2. Existing suites must stay green (332 unit, Playwright). Fix or explain the one failing keyboard test ("scan and fix a field").
3. Wording scan and log-scrub tests still pass (no sensitive values in trails, URLs or logs).
4. Slow 3G: re-measure the vault (the old target is 169 KB / 7.2 s; it was 200 KB / 8.7 s). The smaller base text and the trimmed menu should help; report the real number, even if it is still missed. Do not claim the target unless measured.
5. Run `npm run build`, deploy with `npx vercel deploy --prod --yes`, smoke-test the live site read-only (health, all three role sign-ins, role blocking, header logo loads). Do NOT run the demo reset SQL and do NOT run mutating e2e on the live DB.

## 6. Final report (paste this back to me)
1. Commit hashes and the live URL.
2. Table: part (logo, text size, layout, stepper/trail per flow, names page, tests) -> done / partial / not done, with evidence (file or test).
3. Test counts: unit, Playwright (passed/failed, list failures), axe, eval, npm audit, Slow 3G number.
4. Before/after screenshots path, and the honest list of what still looks weak.
5. Anything you changed that touched logic (there should be none).
