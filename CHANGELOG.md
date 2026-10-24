# CHANGELOG

One line per commit: hash · what · evidence.

- f3008be · Phases 1+2 (offline store; DB checks pending key) · vitest green offline
- 6834aa8 · Phase 3: OCR, assistant, faults, accessibility, Telugu · tests + axe 0 critical/serious
- 675664a · Phase 4: per-recipient shares, gate, watermark, leak trace, kill, ledger page, erase · 151 unit, 30/30 e2e, showcase 17/17
- e3bfe2e · README pitch + screenshots; unconfirmed OCR never shared · eval held-out P 100% / R 96.6% / 0 FA
- d974b19 · handoff: HANDOFF.md + CHANGELOG.md · docs only
- 793cc6a · Phase 5: live-verified, hardened, deploy-ready · db:check ok, live tamper test 13 tables, 168 unit, 32/32 e2e on live DB, axe 0, eval held-out P 100% / R 96.6% / 0 FA, npm audit 0
- PHASE6 · Phase 6: threat model + policy pages, MIT licence, scheduled issuer re-check (cron + CRON_SECRET), rate limits + 15-min lock after 5 wrong codes, Slow 3G vault 12.0 s/405 KB → 7.2 s/169 KB · 183 unit, 37/37 e2e on live DB, axe 30 runs 0, eval held-out P 100% / R 96.6% / 0 FA, showcase 17/17, npm audit 0
