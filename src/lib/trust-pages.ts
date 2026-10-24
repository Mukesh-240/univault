/**
 * TRUST PAGES CONTENT — the threat model (/threat-model) and the policy page (/policy).
 *
 * Plain-English picture:
 *   Each threat row says what stops it, what does NOT stop it, and which real files back the claim
 *   (`evidence`: code and at least one test). tests/trust-pages.test.ts checks that every cited file
 *   exists and that every row cites a test, so the page can't claim protection that isn't built.
 *   Headings come from the locale files (English + Telugu); the body text is English.
 *   Every policy sentence was checked against the code it describes; the code is cited per section.
 */

export interface Threat { key: string; stops: string; notStopped: string; evidence: string[] }

export const THREATS: Threat[] = [
  {
    key: "forged",
    stops: "Every issuer record is signed with Ed25519. A reply signed by another key, or edited after signing, is rejected as untrusted and never accepted.",
    notStopped: "Someone holding the issuer's own private key. Documents with no serial number cannot be checked and stay \"user-uploaded\".",
    evidence: ["src/lib/issuer.ts", "src/lib/verify.ts", "tests/issuer.test.ts", "tests/registry.test.ts"],
  },
  {
    key: "editedOriginal",
    stops: "Originals are immutable: the documents table refuses UPDATE and DELETE (row-level security for the app's key, plus a trigger for every role). A document's identity is the SHA-256 of its content. Corrections are separate append-only assertions.",
    notStopped: "The database owner, who can still TRUNCATE tables from the Supabase SQL editor (used only for the demo reset).",
    evidence: ["docs/sql/001_core_schema.sql", "src/lib/ingest.ts", "tests/properties.test.ts", "tests/live-db.test.ts"],
  },
  {
    key: "tamperedLedger",
    stops: "Each ledger line stores the fingerprint of the line before it, computed by a database trigger. verify_ledger() recomputes the whole chain and names the first broken line. Edits and deletes are refused.",
    notStopped: "The database owner rewriting the entire chain consistently. There is no outside anchor, so the chain detects edits by anyone else, not by the owner.",
    evidence: ["docs/sql/001_core_schema.sql", "src/lib/ledger.ts", "tests/offline-db.test.ts", "tests/live-db.test.ts"],
  },
  {
    key: "forwardedLink",
    stops: "A link alone opens nothing. The visitor also needs the approved recipient ID and a fresh one-time code (single use, 10 minutes). A wrong ID or code is refused, logged, and the owner is notified.",
    notStopped: "A recipient who passes on both their recipient ID and a fresh code. In this prototype the code is shown on screen (SIMULATED), not sent to a separate phone.",
    evidence: ["src/lib/shares.ts", "src/app/s/[token]/route.ts", "tests/shares.test.ts", "e2e/share.e2e.ts", "e2e/journey.e2e.ts"],
  },
  {
    key: "screenshot",
    stops: "Every opened page carries a diagonal watermark: recipient name · recipient code · time · session. The leak-trace tool turns the watermark text back into the exact recipient and viewing session.",
    notStopped: "Taking the screenshot itself, cropping the watermark out, or retyping the values by hand.",
    evidence: ["src/lib/watermark.ts", "src/app/leak-trace/page.tsx", "tests/watermark.test.ts", "e2e/share.e2e.ts"],
  },
  {
    key: "stolenToken",
    stops: "Links are 256-bit random tokens. Only their SHA-256 is stored, so a database reader cannot rebuild a link. A stolen link still needs the recipient ID and a fresh code. Links expire within 30 days and can be killed at once.",
    notStopped: "A thief who also has the recipient's ID and a fresh code, until the owner kills the link.",
    evidence: ["src/lib/shares.ts", "src/lib/share-store.ts", "tests/shares.test.ts"],
  },
  {
    key: "bruteForce",
    stops: "Five wrong one-time codes in a row lock the link for 15 minutes, even against the right code, and the owner is alerted. The lock is a row in the access log, so every server instance sees it. Each visitor address may make 60 recipient requests a minute and each link 20; past that the answer is 429 and nothing else happens.",
    notStopped: "The per-minute limits are counted in each server instance's memory, so an attacker spread across many instances or addresses gets more tries. The database lock still applies to every one of them.",
    evidence: ["src/lib/rate-limit.ts", "src/lib/shares.ts", "src/app/s/[token]/route.ts", "tests/lockout.test.ts", "e2e/share.e2e.ts"],
  },
  {
    key: "wrongMerge",
    stops: "Records are never merged automatically. Name matches are only ranked suggestions with reasons. Only your Confirm or Reject creates a decision, and it is recorded in the ledger.",
    notStopped: "A person confirming a wrong match. The decision is recorded, and a later Reject is recorded after it.",
    evidence: ["src/lib/names.ts", "src/lib/resolution.ts", "tests/names.test.ts", "tests/properties.test.ts"],
  },
  {
    key: "ocrMisread",
    stops: "OCR readings stay \"unconfirmed\" until a person confirms or corrects them. Unconfirmed values cannot pass a readiness rule and are withheld from shares. Low-confidence and suspicious fields are flagged first.",
    notStopped: "A confident misread that a person confirms without checking. Review hints catch 72.5% of misreads on the held-out set.",
    evidence: ["src/lib/disclosure.ts", "src/lib/ocr.ts", "tests/shares.test.ts", "tests/ingest.test.ts"],
  },
  {
    key: "staleVerification",
    stops: "A verification older than 24 hours is labelled stale, no longer counts as passed, and must be redone. Every document in a share is re-verified just before the share is confirmed. After sharing, the issuer is asked again once a day by a scheduled job (and every 60 seconds while the shares page is open); a revoked or changed record alerts the owner once. An unreachable issuer counts as \"unknown\", never as failed.",
    notStopped: "An issuer change between two checks (up to a day when nobody has the shares page open). Nothing is revoked automatically; the owner decides.",
    evidence: ["src/lib/verify.ts", "src/lib/share-store.ts", "src/lib/recheck.ts", "src/app/api/cron/recheck/route.ts", "tests/engines.test.ts", "tests/recheck.test.ts", "e2e/journey.e2e.ts"],
  },
  {
    key: "maliciousUpload",
    stops: "Uploads are structured fields only (no file binaries), checked against a strict schema with size limits; POST bodies over 256 KB are refused. Instruction-like and hidden text is flagged and treated as data. The assistant can only propose; it cannot share.",
    notStopped: "A well-formed document whose contents are simply false. That is what issuer verification is for.",
    evidence: ["src/lib/ingest.ts", "src/middleware.ts", "src/lib/injection.ts", "tests/ingest.test.ts", "tests/injection.test.ts"],
  },
  {
    key: "noLogin",
    stops: "Stated limit. The demo uses one synthetic vault and the public database key. Row-level security lets that key only read and append, never change or delete history.",
    notStopped: "The sign-in is simulated: any valid demo number (starts 0000) gets in, and everyone who signs in sees the same one synthetic vault. The 5-wrong-codes lock counts per server instance. A real deployment needs real identity and per-user row security.",
    evidence: ["docs/sql/001_core_schema.sql", "tests/live-db.test.ts"],
  },
  {
    key: "simulatedIssuer",
    stops: "Stated limit. The issuer is a simulation with real signatures, a timeout and retries. It is labelled SIMULATED on every page.",
    notStopped: "Anything about real-world issuers. No government, university or DigiLocker system is connected.",
    evidence: ["src/lib/issuer-service.ts", "tests/issuer.test.ts"],
  },
  {
    key: "notZeroKnowledge",
    stops: "Stated limit. Yes/no facts such as \"over 18\" are signed attestations, and every share states that they are not zero-knowledge proofs. A tampered value fails the signature check.",
    notStopped: "UNIVAULT seeing your full data. The recipient must trust UNIVAULT's signature; they cannot check the fact independently.",
    evidence: ["src/lib/disclosure.ts", "tests/engines.test.ts"],
  },
];

export interface PolicySection { key: string; paragraphs: string[]; evidence: string[] }

export const POLICY: PolicySection[] = [
  {
    key: "stored",
    paragraphs: [
      "For each document: a cover record (type, title, issuer, serial number, SHA-256 fingerprint, trust tier, writing systems, and whether it is synthetic) and, separately, its content (the field values, any letter text, and OCR confidence scores).",
      "On top of that, as append-only rows: status events, your corrections (with both the original reading and your value), your name-link decisions with their explanations, shares, link fingerprints, every access attempt, and the ledger.",
      "For recipients we store only fingerprints of their device cookie and one-time codes, never the raw values, and never the raw link.",
    ],
    evidence: ["docs/sql/001_core_schema.sql", "docs/sql/002_issuer_payload_policy.sql", "src/lib/ingest.ts", "src/lib/share-store.ts"],
  },
  {
    key: "erase",
    paragraphs: [
      "Erasing a document first revokes every active share that uses it, then permanently deletes its content (the field values, letter text and OCR scores), and records an \"erased\" event and a ledger line.",
      "Kept: the cover record (type, title, issuer, serial, fingerprint) and the event times. They are kept because history tables are append-only and the ledger chain would break without them, so anyone can still prove what happened and when.",
      "Also kept: corrections you typed and name-link explanations, which live in append-only tables. Copies a recipient already downloaded cannot be recalled.",
    ],
    evidence: ["src/app/api/erase/route.ts", "e2e/share.e2e.ts"],
  },
  {
    key: "retention",
    paragraphs: [
      "History is kept until the demo database is reset; nothing is removed automatically.",
      "Time limits: a share link lasts at most 30 days; a one-time code lasts 10 minutes and works once; 5 wrong codes in a row lock a link for 15 minutes; a download pass lasts 15 minutes; a verification counts as fresh for 24 hours; the recipient's device cookie lasts one year and only identifies the browser.",
    ],
    evidence: ["src/lib/shares.ts", "src/lib/verify.ts", "src/app/s/[token]/route.ts"],
  },
  {
    key: "whoSees",
    paragraphs: [
      "Sign-in is simulated: any valid demo number (starting 0000) opens the one synthetic vault, which everyone who signs in shares.",
      "A recipient sees only the items you approved, after passing the ID and one-time-code gate. Values read by OCR that you have not confirmed are withheld. Recipients never see your other documents.",
      "Logs and web addresses carry no personal values: logs go through a scrubber, and links contain only a random token.",
    ],
    evidence: ["src/lib/disclosure.ts", "src/lib/scrub.ts", "tests/scrub.test.ts", "tests/shares.test.ts"],
  },
  {
    key: "kill",
    paragraphs: [
      "\"Kill this link\" marks the link as killed and the share as revoked; \"Kill all links\" does it for every active share. From then on the link shows \"Access denied\", and each attempt is logged and the owner is told.",
      "\"Test this link now\" asks the server what the link would do right now, so you can see that it is really dead. Killing cannot recall copies already downloaded or screenshots already taken.",
    ],
    evidence: ["src/lib/share-store.ts", "src/app/api/shares/kill/route.ts", "e2e/journey.e2e.ts"],
  },
  {
    key: "watermark",
    paragraphs: [
      "Every opened share is covered with faint diagonal text: recipient name · recipient code · time · session code.",
      "It can tell you which recipient and which viewing session a leaked screenshot came from (Leak trace). It cannot stop a screenshot, and it can be cropped out.",
    ],
    evidence: ["src/lib/watermark.ts", "tests/watermark.test.ts"],
  },
];
