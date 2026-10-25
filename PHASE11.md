# PHASE 11: redesign the sign-in page and the home page, and make every feature easy to find

Presentation and navigation only. Do not change verification, rules, ledger, share, kill, upload or database logic. Hackathon is live: work in the order below, commit after each part, deploy after part 3.

## 0. Before you start
1. Read `HANDOFF.md`, `git log --oneline | head -15`, `docs/DESIGN.md`, `PHASE10.md`. Do not redo finished work (logo file, Inter/Noto fonts, 16 px base, Stepper and StepTrail all stay).
2. Standing rules: no hardcoded outputs, no persona/serial/synthetic-flag branching, no LLM in any decision, never claim real Aadhaar/DigiLocker/RTO, banned sentences stay banned ("secure cloud storage", "100% true", "no fake accounts", "zero-knowledge", "prevents screenshots", "recalls downloaded copies", "identity percentage"). Say "English", not "Latin". Update `HANDOFF.md` after each part. Do not run the demo reset or mutating tests on the live DB.
3. Owner's verdict on the current UI, in his words: the home page is too much and a mess, he does not know what each feature does, and the login page is not aesthetic.

## 1. What is wrong today (I looked at your Phase 10 screenshots)
**Sign-in** (`docs/screenshots/phase10/peek/signin-1440-en.jpg`)
- A pale-blue gradient box sits inside a pale page, so there is a box in a box. The headline is squeezed into a narrow column and wraps to three lines. The right half is empty except for a glowing logo.
- Three identical white cards with arbitrary blue/teal/purple top borders; the buttons say "Continue as issuer / sender / receiver" (jargon).
- The header on a sign-in page shows "Text size" and "Need help?" before the user has even started. The footer links are cut off by the fold. Too much empty space at the bottom, too little structure at the top.

**Home** (`docs/screenshots/phase10/after/home-1440-en.jpg`)
- Eight things compete in one screen: header with 6 controls, greeting, three readiness rings, an attention banner that repeats "Degree certificate, Degree certificate, Degree certificate +7", a title with a button, TWO rows of filter chips plus a search box, then a table where most rows just say "Not checked yet".
- Nothing says what UNIVAULT can DO. The side menu says "Activity" and "More", which tell a new user nothing. Features like leak trace, same-person check, scan-and-fix, eligibility, kill user and erase are hidden.

## 2. Design direction (write these 3 sentences into `docs/DESIGN.md` first)
"Calm trust": one job per screen, one blue accent (the logo blue), generous white space, thin borders, soft shadows, Inter. Every screen starts with a title, one plain sentence saying what it is for, and ONE primary action. Anything a first-time user does not need in the first 10 seconds is behind a link, a menu or "Show more".
Do not add colours. Remove the teal/purple role colours and the gradient-in-a-box look. Keep the real logo file and wordmark.

## 3. Sign-in page (do this first)
Desktop (>= 1024 px): **split screen, 50 / 50, full height, no outer card.**
- **Left panel** (brand): deep navy to logo blue, subtle, no glow blobs. Logo lockup top-left (logo 40 px + UNIVAULT). Headline max 2 lines at 40/48 px weight 600: "Don't ask for the document. Ask for the answer." Under it three short proof lines with small icons (no boxes): "Originals can't be edited or deleted", "Share only what a person needs, per person", "Stop sharing any time and see who looked". Bottom-left, small: "Demo: all data is synthetic and sign-in is simulated. No real Aadhaar or government service is used."
- **Right panel** (white, content centred in a 420 px column): title "Sign in to the demo", one line "Pick who you want to be. You can switch later."
  - **Role picker = one vertical list of 3 radio rows** (not 3 cards): icon, plain title, one line. "Student or citizen: keep my documents and share them", "Issuer (university, government office): create official documents", "Receiver (employer, college, bank): ask for documents and check them". Selected row gets a blue border and a check. Use the words the cast uses (VIT, Government, Mahesh Mekhala, Google) from the demo-cast config as the example profile line shown after selection ("Signing in as Mahesh Mekhala").
  - **One primary button** "Continue" (full width, 44 px). No per-role button.
  - Next steps (demo number, code on screen, consent) happen in THE SAME panel with the Stepper "Step 2 of 3", a Back link, and the code shown in a clearly SIMULATED pill. No page jump.
- Header on this page: only the language toggle (right). Move Text size and Help into a small footer row. No bell, no search.
- Footer: Threat model, Policies, Text size, small, inside the viewport (no cut-off).
Mobile: stacked; a compact 120 px brand strip on top (logo + one line), then the form. No horizontal scroll at 360 px; works at A++.
Motion: one gentle fade/slide on step change; off for reduced motion.

## 4. Home page (the main fix)
Replace the home with this structure, top to bottom, max width 1100 px:
1. **Greeting line**: "Namaste, Mahesh" (first name, 24 px, weight 600) and one status sentence built from real data: "9 documents. 4 need your attention."
2. **"What do you want to do?"** row of 4 action tiles (icon, verb title, one line, whole tile clickable):
   - **Add a document**: "Upload a PDF or photo, or get one from an issuer."
   - **Check if I'm ready**: "See what you are missing for a job, scholarship or overseas check."
   - **Share with someone**: "Pick what to show, to whom, and for how long."
   - **See who has my documents**: "Review shares, stop sharing, trace a leaked copy."
3. **Needs your attention** card: at most 3 rows, each = document name, the reason in plain words, and one button ("Check with issuer", "Confirm details"). De-duplicate: never repeat the same title; group ("Degree certificate: 3 copies, 1 not checked") or show distinct reasons. "See all 9" link. If nothing needs attention, show a calm "All clear" line instead.
4. **Ready for...** ONE card (not three) with a purpose selector (Job / Scholarship / Overseas check) and one ring + sentence + "See what is missing". Content comes from the existing readiness rules.
5. **My documents**: compact list, 6 rows, columns: icon + title, issuer, status chip (icon + text). Row click opens the document; row menu "..." for actions. Filters collapse to one search box and one "Filter" dropdown (Status, Source). "See all documents" opens the full list page with the filters.
6. Remove from home: the three rings row, the repeating banner, the double chip rows, the "Not checked yet" wall (show "Check now" once per list, or a single bulk "Check all" button).

**Header** (all signed-in pages): logo, global search, language toggle, bell, avatar menu. The avatar menu holds: Text size, High contrast, Help, Switch role, Sign out. Remove the separate "Text size" and "Need help?" buttons from the bar. Help stays reachable as a `?` item in the avatar menu and as a small floating `?` that never covers content.

**Side menu** (sender), names that say what they do, max 6, each with an icon:
Home · My documents · Get ready · Share and requests · Who has access · Proof and activity. Everything else goes inside those pages as tabs or links: Scan and fix and Same person under My documents; Check with issuer and History under a document; Leak trace, Ledger and Faults under Proof and activity; Threat model, Policy and Demo guide under a small "Trust and demo" section at the bottom. Do the same for the Issuer and Receiver menus (max 5 each). Active item = soft blue pill.

## 5. Make every feature discoverable (the "I don't know what feature is where" fix)
1. **Page header pattern** on every signed-in page: title, one plain sentence "what this page is for", and the single primary action on the right. Add the sentences in `en.json` and `te.json` together.
2. **`/features` page "What UNIVAULT can do"**, linked from the avatar menu and the Home footer: about 12 cards in 3 groups (Keep and prove, Share safely, Stay in control), each with an icon, a one-line plain description, a status chip (Built / Partly built / Not built: take the honest status from `docs/GAP_AUDIT.md`, do not overstate) and a "Try it" button that opens the right screen. Groups: Keep and prove = add document, verify with issuer, same person, scan and fix, readiness; Share safely = share wizard, per-person link with code, request and eligibility, watermark; Stay in control = stop sharing (link/person/all), who has access, leak trace, erase, ledger.
3. **First-run tour**: on first sign-in show a dismissible 4-step overlay (add -> check -> share -> stop) with the Stepper pattern and a "Skip" button; remember dismissal in a cookie. Reopenable from Help.
4. **Demo guide** `/demo` for judges: the demo script as 6 numbered steps, each a plain sentence and a "Go" button to the exact screen, with the role to use. Built from a config file, no hardcoded results.
5. **Empty states** designed: one sentence, one action.
6. Keep the Stepper and StepTrail from Phase 10 on the flows; do not remove them.

## 6. Apply the system to the rest (after parts 3 to 5)
Document page, Am I ready?, Share wizard, My shares, Alerts, Issuer dashboard and issue wizard, Receiver inbox/ask/viewer, recipient page `/s/[token]`. Rules: same page header pattern, same button set (primary, secondary, quiet), same card, status chip = icon + text, max one primary button per screen, no nested cards, spacing scale 4/8/12/16/24/32.

## 7. Proof
1. Screenshots before and after in `docs/screenshots/phase11/` at 1440, 768, 390 px, English and Telugu, for: sign-in (3 steps), home, features, demo guide, one flow page per role.
2. Self-critique, two rounds per page (beauty, first-time clarity, contrast, trust), say plainly it is self-assessed. Test the home and sign-in on someone who has not seen them: ask the owner to say what each screen is for in 5 seconds; if the screen fails that, fix it.
3. Tests: axe 0 violations at 100 %, A+, A++ and high contrast; no sideways scroll at 360 px; keyboard-only walk of sign-in, home, and share; Telugu parity test; unit/e2e suites stay green (list failures if any); new e2e: sign-in role list works with the keyboard, home shows at most 3 attention rows and no duplicate titles, `/features` links all resolve, `/demo` steps all resolve.
4. Run in-memory/offline stores for tests (as the last commit does), never the live DB. Re-measure Slow 3G and report the real number.
5. `npm run build`, deploy with `npx vercel deploy --prod --yes`, read-only live smoke test (health, three sign-ins, role blocking, logo loads).

## 8. Final report (paste back to me)
1. Commit hashes and live URL.
2. Table: part (sign-in, home, header, side menu, features page, tour, demo guide, rest of pages) -> done / partial / not done, with evidence.
3. Test counts: unit, Playwright (passed/failed, list failures), axe, Slow 3G number.
4. Before/after screenshot paths and an honest list of what still looks weak.
5. Anything that touched logic (should be none).
