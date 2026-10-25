# UNIVAULT design rules (Phase 7)

Where a rule below conflicts with the Phase 7 brief (20px base text, plain words, big buttons, Telugu parity, synthetic 0000 Aadhaar), the brief wins.

1. **Pick the direction before coding** (frontend-design, frontend-design-direction): write the page's job, audience and one memorable detail first; this is a calm, repeat-use tool for first-time and low-literacy users, so quiet and scannable beats expressive. Spend boldness in one place only.
2. **Avoid the generated-page tells** (frontend-design, design-system): no cream-and-terracotta or acid-green defaults, no purple gradients, no identical rounded cards in cards, no all-caps eyebrow labels, no "01 / 02 / 03" unless it is a real sequence, no `→` on buttons. Use the existing teal/navy tokens in `globals.css`, not new hex values.
3. **Words are design** (frontend-design): sentence case, active verbs ("Save changes", not "Submit"), the same action keeps the same name through the whole flow, errors say what went wrong and how to fix it and never apologise, empty screens invite an action.
4. **Every state is designed** (frontend-design-direction): loading, empty, error, partial, success and permission each get a trigger, visible feedback and a safe next action; "not applicable" needs a written reason, and an untestable state is reported as untested.
5. **Targets and type** (accessibility, a11y-architect, make-interfaces-feel-better): 20px base text, line length under 80 characters, buttons at least 48px high (WCAG 2.2 asks 24px; we go beyond), 4px+ gap between targets, `text-wrap: balance` on headings, `tabular-nums` on changing numbers, no `transition: all`.
6. **Contrast and focus** (accessibility): text 4.5:1 and UI parts 3:1, a visible high-contrast focus ring on everything, never colour alone for meaning (pair it with words), content reflows at 400% zoom with no fixed-size containers.
7. **Semantics first** (frontend-a11y): real `<button>`, `<a>`, `<label for>`; errors linked by `aria-describedby` with `aria-invalid`, status text in a live region; no `onClick` on a `div`; icon-only buttons get a label; modals contain focus, close on Escape, and return focus to the trigger; sequential heading levels.
8. **Motion only when it answers an action** (frontend-design, make-interfaces-feel-better): no entrance animations on load, short interruptible CSS transitions for state changes, `prefers-reduced-motion` respected everywhere.
9. **Telugu parity is a build check, not a polish pass** (i18n-sync): every new key lands in `en.json` and `te.json` together, placeholders keep the same names, labels are chosen from how the screen uses them (not the word alone), and long Telugu strings must wrap without overflow; native-speaker review is listed as still open, not claimed done.
10. **Prove it on the rendered page** (browser-qa, e2e-testing): check 375, 768 and 1440 px in English and Telugu, run axe plus a keyboard-only walk and say plainly that axe covers only part of WCAG, wait on locators and responses (never fixed timeouts), keep screenshots as artifacts, never run mutating journeys against the live demo without saying so, and end with a SHIP / SHIP WITH FIXES / DO NOT SHIP verdict (INCONCLUSIVE when there is no baseline).

Not applied on purpose: the `taste` skill is a music-video aesthetic guide (only its "decide the direction first" idea is used, in rule 1). Nothing was copied from the skill repos into this project, and none of their hooks, commands or scripts were added.

## Phase 8 critique rounds (gan-design style, honest note)
The generate-and-critique loop was run by ONE agent (the author) scoring screenshots against the rubric, not by a separate evaluator, and only on the three pages the brief names. Scores are 1 to 5, self-assessed from screenshots and objective checks (axe, contrast tests, touch targets, overflow probes). Telugu quality is NOT scored: no native speaker has reviewed it (see TELUGU_REVIEW.md); only layout in Telugu was checked. Animation smoothness was not measured (no frame trace); only that nothing flashes and that reduced motion switches it off.

| Page | Round | Beauty | Older-user clarity | Contrast | Trust | What changed |
|---|---|---|---|---|---|---|
| Sign-in chooser | 1 | 2 | 2 | 4 | 3 | Content was squeezed into a 15rem column (no side menu on this page) |
| | 2 | 4 | 4 | 5 | 4 | Single-column shell when there is no menu; third role card wrapped, narrowed the minimum width |
| | 3 | 4 | 5 | 5 | 4 | Phone: logo hidden, header stacks; keeps the hero gradient and calm footer line |
| Sender home | 1 | 3 | 3 | 5 | 4 | Header overflowed (search + 6 buttons) |
| | 2 | 4 | 4 | 5 | 4 | Search moved into the side menu below 1600px; header on one row at 18px text |
| | 3 | 4 | 4 | 5 | 4 | Readiness cards became ring + sentence + button in a row |
| Issue wizard | 1 | 4 | 4 | 5 | 4 | First pass already clear: paper preview beside the form |
| | 2 | 4 | 5 | 5 | 5 | Only document kinds the issuer is authorised for are offered; SIMULATED ISSUER chip on the paper |
| | 3 | 5 | 5 | 5 | 5 | Seal stamps on signing; wizard steps slide; reduced motion shows the final state |
The best version of each page is the one in the repository.

## Phase 10 direction (written before the redo)
Calm and official, like DigiLocker: white cards on a light grey-blue page, one blue action colour taken from the logo, thin 1px borders, a soft shadow, 16px text with weights no heavier than 600, and spacing only from 4 / 8 / 12 / 16 / 24 / 32 px. Every screen has one obvious next action, and every automated result says what the system did, step by step, in plain words.

Changes from Phase 8 that this direction overrides: 20px base text becomes 16px (A+ 18, A++ 20); 48px buttons become 44px; the 12-link side menu becomes at most six entries; the floating "Need help?" moves into the top bar (so it can never cover a field); the hero banner on Home becomes one line.

## Phase 10 critique rounds (self-assessed, honest note)
Same rubric as Phase 8 (1 to 5: beauty, clarity for an older user, contrast, trust). Scored by ONE agent (the author) from the screenshots in `docs/screenshots/phase10/` (before = the live Phase 9 site, after = this build) plus objective checks: axe 0 on every page at 16/18/20 px and high contrast, `tests/contrast.test.ts`, 360 px no sideways scroll, CLS readings. Telugu wording is not scored (no native review). Two rounds per page; round 1 fixes are in commit 81b7d97.

| Page | Round | Beauty | Older-user clarity | Contrast | Trust | What changed / what is still weak |
|---|---|---|---|---|---|---|
| Header + side menu | 1 | 4 | 4 | 5 | 4 | 56px white bar, six menu entries; "EN" label failed axe 2.5.3 |
| | 2 | 4 | 4 | 5 | 4 | Shows "English" in full; phones fold language/size/profile into Menu |
| Home | 1 | 4 | 4 | 5 | 4 | One-line greeting, list instead of cards; footer caused a 0.22 layout shift |
| | 2 | 4 | 4 | 5 | 4 | Footer below the fold (CLS 0.003 in English). Weak: "Needs your attention" repeats "Degree certificate" three times |
| Share wizard | 1 | 4 | 5 | 5 | 5 | Stepper with here/next; raw purpose ids replaced by pack titles |
| | 2 | 4 | 5 | 5 | 5 | Stepper lines flow as sentences on phones; receipt shows the trail and Under the hood |
| Issue wizard | 1 | 3 | 4 | 5 | 5 | Person card content was centred |
| | 2 | 4 | 5 | 5 | 5 | Left-aligned; the signed paper sits beside a seven-step trail |
| Recipient pages `/s/*` | 1 | 3 | 4 | 5 | 4 | Old 20px/700 style; trail heading too large on phones |
| | 2 | 4 | 4 | 5 | 5 | Same calm system, stepper + trail in plain HTML (no scripts) |
| Receiver inbox | 1 | 3 | 3 | 5 | 4 | Cards in a grid |
| | 2 | 3 | 3 | 5 | 4 | Weak: many identical "Ended by the owner" cards from test runs; "1 items"; purpose shown as a raw id |
| Sign-in | 1 | 4 | 4 | 5 | 4 | Heading wrapped at 22ch |
| | 2 | 4 | 5 | 5 | 5 | 32ch heading; stepper and a trail of what the server accepted |
