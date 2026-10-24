/**
 * RECIPES — the test-case menu.
 *
 * Plain-English picture:
 *   The spec (section 16.3) lists "dimensions" of trouble (names, dates, tampering, OCR, ...) and,
 *   for each, several "levels" (e.g. for dates: expired 1 day ago, 9 days ago, 400 days ago...).
 *   This file has ONE small recipe per level. A recipe invents a fresh person, builds their clean
 *   documents (world.ts), applies the right damage (mutators.ts), and writes down what a correct
 *   system SHOULD conclude (the "expected" answer).
 *
 *   The generator (generate.ts) runs every recipe at least 10 times with different random people.
 *
 * VERY IMPORTANT: the "expected" answers are written ONLY into the labels files. The app never
 * reads labels; only the tests and the evaluation harness do. That is how we prove the app
 * computes its answers from the data instead of having them built in.
 */
import bank from "./name-bank.json";
import * as m from "./mutators";
import type { Rng } from "./prng";
import {
  degreeCertificate, formatDate, idCard, incomeCertificate, makePerson, marksheet,
  referenceLetter, schoolCertificate, type DateFormat, type DocDraft, type Person, type RegDraft,
} from "./world";

// ─────────────────────────────── Shapes ───────────────────────────────

/** A recipient's request for information (used by the over-broad-request cases). */
export interface RequestDraft {
  role: string;
  recipient_purpose: string;   // what the recipient organisation is for (job / scholarship / ...)
  purpose: string;             // what the request SAYS it is for
  requested: string[];         // items asked for, e.g. "id_card.id_number" or derived "id_card.id_number_last4"
  doc_roles: string[];         // which of the case's documents the request concerns
}

/** One step a person takes with a share link (used by the sharing cases). */
export type ShareAction =
  | { step: "open"; actor: "recipient" | "stranger"; device: "A" | "B"; recipient_id: "correct" | "wrong"; otp: "fresh" | "reused" | "wrong" }
  | { step: "download" } | { step: "kill" } | { step: "revoke" } | { step: "reshare" } | { step: "open_other_share" };

/** A sharing scenario: what is shared, with whom, for how long, under which policy, then what happens. */
export interface ScenarioDraft {
  role: string;
  doc_roles: string[];
  recipient_purpose: string;
  expiry_days: number;                                     // days from "today" until the share expires
  policy: { mode: "view_only" | "download"; max_views?: number };
  actions: ShareAction[];
}

/** Everything one test case produces. */
export interface CaseOut {
  docs: { role: string; doc: DocDraft }[];
  registry: RegDraft[];
  requests?: RequestDraft[];
  scenarios?: ScenarioDraft[];
  /** Test-setup conditions (e.g. "issuer is down") — settings for the run, not facts in the data. */
  conditions?: Record<string, unknown>;
  /** The correct answer, by construction. Goes ONLY to the labels file. */
  expected: Record<string, unknown>;
}

/** Tools a recipe gets: the random generator, "today", a person factory, and the final reference of a document role. */
export interface Ctx { rng: Rng; ref: string; person: (o?: Parameters<typeof makePerson>[2]) => Person; refOf: (role: string) => string }
export type Recipe = (c: Ctx) => CaseOut;

// ─────────────────────────────── Small helpers ───────────────────────────────

/** Put a name into a document's "name" field. */
const named = (doc: DocDraft, name: string): DocDraft => m.setField(doc, "name", name);

/** Which fields differ between what the person holds and the issuer's record (spaces at the ends ignored). */
function differingFields(doc: DocDraft, reg: RegDraft): string[] {
  const keys = new Set([...Object.keys(doc.fields), ...Object.keys(reg.fields)]);
  return [...keys].filter((k) => doc.fields[k]?.trim() !== reg.fields[k]?.trim()).sort();
}

/**
 * Age in whole years on date `on`. Convention (documented in the data card): someone born on
 * 29 February has their birthday on 1 March in non-leap years.
 */
export function ageOn(dob: string, on: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, mo, d] = on.split("-").map(Number);
  const leap = (yr: number) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
  const [bMonth, bDay] = bm === 2 && bd === 29 && !leap(y) ? [3, 1] : [bm, bd];
  return y - by - (mo < bMonth || (mo === bMonth && d < bDay) ? 1 : 0);
}

// ─────────────────────────────── NAMES ───────────────────────────────
// Two documents of the same person (ID card + degree), the degree's name written a certain way.
// expected.same_person says whether a correct matcher should consider them the same person.

function namePair(c: Ctx, p: Person, idName: string, degreeName: string, samePerson: boolean, other?: Person): CaseOut {
  const id = idCard(p, c.rng);
  const deg = degreeCertificate(other ?? p, c.rng);
  return {
    docs: [{ role: "a", doc: named(id.doc, idName) }, { role: "b", doc: named(deg.doc, degreeName) }],
    // The issuer printed the names exactly as they appear, so verification itself is clean here.
    registry: [{ ...id.registry!, fields: { ...id.registry!.fields, name: idName } }, { ...deg.registry!, fields: { ...deg.registry!.fields, name: degreeName } }],
    expected: { detector: "name_match", pair: [c.refOf("a"), c.refOf("b")], same_person: samePerson, never_auto_merge: true },
  };
}

const LONG_SURNAMES = bank.surnames.filter((s) => s.latin.length >= 10);

const NAMES: Record<string, Recipe> = {
  exact: (c) => { const p = c.person(); return namePair(c, p, m.nameExact(p), m.nameExact(p), true); },
  initials: (c) => { const p = c.person({ givenCount: 2 }); return namePair(c, p, m.nameExact(p), m.nameInitialSurname(p), true); },
  expanded: (c) => { const p = c.person({ givenCount: 2 }); return namePair(c, p, m.nameShort(p), m.nameExact(p), true); },
  reordered: (c) => { const p = c.person(); return namePair(c, p, m.nameExact(p), m.nameReordered(p), true); },
  honorific: (c) => { const p = c.person(); return namePair(c, p, m.nameExact(p), m.nameHonorific(p, c.rng, bank.honorifics), true); },
  hyphenated: (c) => { const p = c.person({ givenCount: 2 }); return namePair(c, p, m.nameExact(p), m.nameHyphenated(p), true); },
  single_name: (c) => { const p = c.person({ givenCount: 1 }); return namePair(c, p, p.given[0].latin, m.nameExact(p), true); },
  very_long: (c) => {
    const p = c.person({ givenCount: 3, surname: c.rng.pick(LONG_SURNAMES) });
    return namePair(c, p, m.nameExact(p), `${p.given[0].latin} ${p.given.slice(1).map((g) => `${g.latin[0]}.`).join(" ")} ${p.surname.latin}`, true);
  },
  telugu_script: (c) => { const p = c.person(); return namePair(c, p, m.nameExact(p), m.nameTelugu(p), true); },
  mixed_script: (c) => { const p = c.person(); return namePair(c, p, m.nameExact(p), m.nameMixedScript(p), true); },
  diacritics: (c) => { const p = c.person(); return namePair(c, p, m.nameExact(p), m.nameDiacritics(p), true); },
  typo: (c) => { const p = c.person(); return namePair(c, p, m.nameExact(p), m.nameTypo(p, c.rng), true); },
  spelling_variant: (c) => { const p = c.person(); return namePair(c, p, m.nameExact(p), m.nameSpellingVariant(p, c.rng), true); },
  // NEGATIVE: a different person who shares the given names (different surname) — must NOT be judged the same.
  different_person_similar_name: (c) => {
    const p = c.person({ givenCount: 2 });
    const q = c.person({ given: p.given, surname: c.rng.pick(bank.surnames.filter((s) => s.latin !== p.surname.latin)) });
    return namePair(c, p, m.nameExact(p), m.nameExact(q), false, q);
  },
};

// ─────────────────────────────── DATES ───────────────────────────────

/** An income certificate expiring `days` from today; expected: still valid, or expired by N days. */
const expiry = (days: number): Recipe => (c) => {
  const b = incomeCertificate(c.person(), c.rng, c.ref, days);
  return {
    docs: [{ role: "income", doc: b.doc }], registry: [b.registry!],
    expected: { detector: "not_expired", doc: c.refOf("income"), result: days >= 0 ? "pass" : "fail", ...(days < 0 ? { days_expired: -days } : {}) },
  };
};

/** Someone at the "turns 18" boundary; the ID card carries the date of birth. */
const ageBoundary = (offsetDays: number): Recipe => (c) => {
  const p = m.setAgeBoundary(c.person(), c.ref, 18, offsetDays);
  const b = idCard(p, c.rng);
  return { docs: [{ role: "id", doc: b.doc }], registry: [b.registry!], expected: { detector: "age_at_least", years: 18, doc: c.refOf("id"), result: ageOn(p.dob, c.ref) >= 18 ? "pass" : "fail" } };
};

/** Same date of birth printed in two different styles on two documents: must NOT be called a mismatch. */
const dobFormat = (fmt: DateFormat): Recipe => (c) => {
  const p = c.person();
  const id = idCard(p, c.rng);
  const sch = schoolCertificate(p, c.rng);
  const idDoc = m.setField(id.doc, "dob", formatDate(p.dob, fmt));
  return {
    docs: [{ role: "id", doc: idDoc }, { role: "school", doc: sch.doc }],
    registry: [{ ...id.registry!, fields: { ...idDoc.fields } }, sch.registry!],
    expected: { detector: "dob_consistent", pair: [c.refOf("id"), c.refOf("school")], result: "consistent" },
  };
};

const DATES: Record<string, Recipe> = {
  expires_future: (c) => expiry(c.rng.int(30, 300))(c),
  expires_today: expiry(0),
  expired_1d: expiry(-1),
  expired_9d: expiry(-9),
  expired_400d: expiry(-400),
  future_dated_issue: (c) => {
    const b = incomeCertificate(c.person(), c.rng, c.ref, 300);
    const doc = m.setFutureIssue(b.doc, c.ref, c.rng.int(5, 60));
    return { docs: [{ role: "income", doc }], registry: [{ ...b.registry!, fields: { ...doc.fields } }], expected: { detector: "issue_date_valid", doc: c.refOf("income"), result: "fail" } };
  },
  leap_day_dob: (c) => {
    // Born on 29 February of a leap year near the 18-year boundary; the answer follows the documented convention.
    const leapYears = [-20, -19, -18, -17, -16].map((d) => Number(c.ref.slice(0, 4)) + d).filter((y) => y % 4 === 0);
    const p = { ...c.person(), dob: `${c.rng.pick(leapYears)}-02-29` };
    const b = idCard(p, c.rng);
    return { docs: [{ role: "id", doc: b.doc }], registry: [b.registry!], expected: { detector: "age_at_least", years: 18, doc: c.refOf("id"), result: ageOn(p.dob, c.ref) >= 18 ? "pass" : "fail", convention: "29 Feb birthday counts on 1 Mar in non-leap years" } };
  },
  turns18_tomorrow: ageBoundary(1),
  turns18_today: ageBoundary(0),
  turns18_yesterday: ageBoundary(-1),
  fmt_dmy: dobFormat("dmy"),
  fmt_iso: dobFormat("iso"),
  fmt_long: dobFormat("long"),
  fmt_te_numerals: dobFormat("te_digits"),
};

// ─────────────────────────────── TAMPERING ───────────────────────────────
// The issuer's record is the clean degree; the person's copy is changed in one specific way.

const tamper = (change: (d: DocDraft, c: Ctx) => DocDraft): Recipe => (c) => {
  const b = degreeCertificate(c.person(), c.rng);
  const doc = change(b.doc, c);
  const fields = differingFields(doc, b.registry!);
  return {
    docs: [{ role: "copy", doc }], registry: [b.registry!],
    expected: { detector: "issuer_verify", doc: c.refOf("copy"), state: fields.length ? "tamper_flagged" : "verified", mismatched_fields: fields },
  };
};

const TAMPERING: Record<string, Recipe> = {
  none: tamper((d) => d),
  single_digit: tamper((d, c) => m.alterDigit(d, c.rng.pick(["cgpa", "reg_no", "year_of_passing"]), c.rng)),
  two_fields: tamper((d, c) => m.alterDigit(m.alterDigit(d, "cgpa", c.rng), "reg_no", c.rng)),
  swapped_fields: tamper((d) => m.swapFields(d, "degree", "branch")),
  extra_field: tamper((d) => m.addField(d, "remarks", "First class with distinction")),
  missing_field: tamper((d, c) => m.dropField(d, c.rng.pick(["year_of_passing", "branch"]))),
  trailing_whitespace: tamper((d) => m.trailingWhitespace(d, "name")),        // near-miss: values equal, only spacing differs
  homoglyph: tamper((d) => m.homoglyph(d, "name")),
  whole_record_replaced: tamper((d, c) => m.replaceRecord(d, degreeCertificate(c.person(), c.rng).doc)),
};

// ─────────────────────────────── OCR ───────────────────────────────

const ocr = (level: m.OcrLevel): Recipe => (c) => {
  const b = marksheet(c.person(), c.rng);
  const r = m.ocrNoise(b.doc, level, c.rng);
  return {
    docs: [{ role: "scan", doc: r.doc }], registry: [b.registry!],
    expected: { detector: "ocr", doc: c.refOf("scan"), misread_fields: [...r.misread].sort(), ground_truth: b.registry!.fields, confirmed_by_user: false, scan_confirmed_rule: "unknown" },
  };
};
const OCR: Record<string, Recipe> = Object.fromEntries(
  (["clean", "mild_blur", "heavy_noise", "skew", "low_contrast", "mixed_script", "digit_confusion", "telugu_conjuncts"] as m.OcrLevel[]).map((l) => [l, ocr(l)]));

// ─────────────────────────────── ISSUER STATE ───────────────────────────────

const issuerCase = (mutate: (r: RegDraft, c: Ctx) => RegDraft[], expected: Record<string, unknown>, conditions?: (c: Ctx) => Record<string, unknown>): Recipe => (c) => {
  const b = degreeCertificate(c.person(), c.rng);
  return { docs: [{ role: "doc", doc: b.doc }], registry: mutate(b.registry!, c), conditions: conditions?.(c), expected: { detector: "issuer_verify", doc: c.refOf("doc"), ...expected } };
};

const ISSUER: Record<string, Recipe> = {
  active: issuerCase((r) => [r], { state: "verified" }),
  superseded: issuerCase((r, c) => [m.supersede(r, `SSU-DEG-${c.rng.digits(6)}`)], { state: "superseded" }),
  revoked: issuerCase((r) => [m.revoke(r)], { state: "revoked" }),
  unreachable: issuerCase((r) => [r], { state: "unverifiable", reason: "issuer_unreachable" }, () => ({ issuer_down: true })),
  stale: issuerCase((r) => [r], { state: "stale", must_reverify_before_share: true }, (c) => ({ last_verified_hours_ago: c.rng.int(25, 96) })),
  forged_signature: issuerCase((r) => [m.forge(r)], { state: "unverifiable", reason: "signature_invalid" }),
  unknown_serial: issuerCase(() => [], { state: "unverifiable", reason: "no_record" }),
  version_bump_after_share: (c) => {
    const b = degreeCertificate(c.person(), c.rng);
    return {
      docs: [{ role: "doc", doc: b.doc }], registry: m.versionBump(b.registry!, "cgpa", c.rng), conditions: { shared_at_version: 1 },
      expected: { detector: "issuer_verify", doc: c.refOf("doc"), state: "issuer_updated", matches_version: 1, changed_fields: ["cgpa"], affected_share_must_be_listed: true },
    };
  },
};

// ─────────────────────────────── DUPLICATES ───────────────────────────────

const dup = (kind: m.DuplicateKind, build: (p: Person, c: Ctx) => { doc: DocDraft; registry: RegDraft | null }): Recipe => (c) => {
  const b = build(c.person(), c);
  return {
    docs: [{ role: "first", doc: b.doc }, { role: "second", doc: m.duplicate(b.doc, kind, c.rng) }], registry: b.registry ? [b.registry] : [],
    expected: { detector: "duplicate", pair: [c.refOf("first"), c.refOf("second")], kind },
  };
};
const DUPLICATES: Record<string, Recipe> = {
  exact: dup("exact", (p, c) => degreeCertificate(p, c.rng)),
  near: dup("near", (p, c) => schoolCertificate(p, c.rng)),
  rescan: dup("rescan", (p, c) => degreeCertificate(p, c.rng)),
  same_serial_different_content: dup("same_serial_different_content", (p, c) => degreeCertificate(p, c.rng)),
};

// ─────────────────────────────── INJECTION ───────────────────────────────

const inj = (v: m.InjectionVariant): Recipe => (c) => {
  const b = referenceLetter(c.person(), c.rng, c.ref);
  return {
    docs: [{ role: "letter", doc: m.injectText(b.doc, v, c.rng) }], registry: [],
    expected: { detector: "injection", doc: c.refOf("letter"), flagged: v !== "benign_assistant", share_created: false },
  };
};
const INJECTION: Record<string, Recipe> = Object.fromEntries(
  (["visible_instruction", "zero_width", "hidden_text", "multilingual", "benign_assistant"] as m.InjectionVariant[]).map((v) => [v, inj(v)]));

// ─────────────────────────────── OVER-BROAD REQUESTS ───────────────────────────────
// The generator's OWN model of "what each purpose minimally needs". The app's rule files
// (src/rules, Phase 2) are written separately; any disagreement shows up in evaluation.

export const MINIMAL: Record<string, string[]> = {
  job: ["id_card.name", "id_card.id_number_last4", "degree_certificate.degree", "degree_certificate.branch", "degree_certificate.year_of_passing"],
  scholarship: ["id_card.name", "id_card.id_number_last4", "income_certificate.annual_income", "income_certificate.valid_until", "marksheet.result"],
  overseas_credential_check: ["degree_certificate.name", "degree_certificate.degree", "degree_certificate.cgpa", "degree_certificate.serial", "marksheet.total_marks"],
};
const EXTRAS = ["id_card.id_number", "id_card.dob", "id_card.address", "income_certificate.annual_income", "marksheet.name_te", "degree_certificate.cgpa", "marksheet.reg_no"];

const request = (make: (c: Ctx, purpose: string) => { requested: string[]; declared: string; expected: Record<string, unknown> }): Recipe => (c) => {
  const p = c.person();
  const built = [idCard(p, c.rng), degreeCertificate(p, c.rng), incomeCertificate(p, c.rng, c.ref, 200), marksheet(p, c.rng)];
  const roles = ["id", "degree", "income", "marks"];
  const purpose = c.rng.pick(Object.keys(MINIMAL));
  const r = make(c, purpose);
  return {
    docs: built.map((d, i) => ({ role: roles[i], doc: d.doc })), registry: built.map((d) => d.registry!),
    requests: [{ role: "req", recipient_purpose: purpose, purpose: r.declared, requested: r.requested, doc_roles: roles }],
    expected: { detector: "over_broad", request: c.refOf("req"), ...r.expected },
  };
};
const extrasFor = (purpose: string) => EXTRAS.filter((e) => !MINIMAL[purpose].includes(e));

const OVER_BROAD: Record<string, Recipe> = {
  none: request((_c, p) => ({ requested: MINIMAL[p], declared: p, expected: { flagged: false, extra: [] } })),
  one_extra_field: request((c, p) => { const e = c.rng.pick(extrasFor(p)); return { requested: [...MINIMAL[p], e], declared: p, expected: { flagged: true, extra: [e] } }; }),
  many_extra_fields: request((c, p) => { const e = c.rng.shuffle(extrasFor(p)).slice(0, 3).sort(); return { requested: [...MINIMAL[p], ...e], declared: p, expected: { flagged: true, extra: e } }; }),
  full_id_instead_of_last4: request((_c, p) => {
    const base = MINIMAL[p].filter((x) => x !== "id_card.id_number_last4");
    return { requested: [...base, "id_card.id_number"], declared: p, expected: { flagged: true, extra: ["id_card.id_number"], minimal_alternative: "id_card.id_number_last4" } };
  }),
  purpose_mismatch: request((c, p) => {
    const other = c.rng.pick(Object.keys(MINIMAL).filter((x) => x !== p));
    return { requested: MINIMAL[other], declared: other, expected: { flagged: true, reason: "purpose_mismatch", recipient_purpose: p, declared_purpose: other } };
  }),
};

// ─────────────────────────────── SHARING ───────────────────────────────
// Expected outcome for every action step, in order. "notify" = the owner should get a bell notification.

const open = (o: Partial<Extract<ShareAction, { step: "open" }>> = {}): ShareAction =>
  ({ step: "open", actor: "recipient", device: "A", recipient_id: "correct", otp: "fresh", ...o });

const share = (expiryDays: number, policy: ScenarioDraft["policy"], actions: ShareAction[], outcomes: { result: string; notify?: string }[]): Recipe => (c) => {
  const p = c.person();
  const deg = degreeCertificate(p, c.rng);
  const id = idCard(p, c.rng);
  return {
    docs: [{ role: "degree", doc: deg.doc }, { role: "id", doc: id.doc }], registry: [deg.registry!, id.registry!],
    scenarios: [{ role: "share", doc_roles: ["degree"], recipient_purpose: c.rng.pick(Object.keys(MINIMAL)), expiry_days: expiryDays, policy, actions }],
    expected: { detector: "share_access", scenario: c.refOf("share"), outcomes },
  };
};

const SHARING: Record<string, Recipe> = {
  expiry_now: share(0, { mode: "view_only" }, [open()], [{ result: "denied:expired", notify: "expired_link_attempt" }]),
  expiry_30d: share(30, { mode: "view_only" }, [open()], [{ result: "allowed", notify: "first_open" }]),
  expiry_past: share(-1, { mode: "view_only" }, [open()], [{ result: "rejected_at_creation:expiry_in_past" }]),
  view_only: share(7, { mode: "view_only" }, [open(), { step: "download" }], [{ result: "allowed", notify: "first_open" }, { result: "denied:view_only" }]),
  download: share(7, { mode: "download" }, [open(), { step: "download" }], [{ result: "allowed", notify: "first_open" }, { result: "allowed:watermarked_copy_fingerprint_logged" }]),
  max_views: share(7, { mode: "view_only", max_views: 2 }, [open(), open(), open()],
    [{ result: "allowed", notify: "first_open" }, { result: "allowed" }, { result: "denied:max_views" }]),
  wrong_recipient_id: share(7, { mode: "view_only" }, [open({ actor: "stranger", recipient_id: "wrong" })], [{ result: "denied:wrong_recipient", notify: "wrong_recipient_attempt" }]),
  reused_otp: share(7, { mode: "view_only" }, [open(), open({ device: "B", otp: "reused" })], [{ result: "allowed", notify: "first_open" }, { result: "denied:otp_reused", notify: "wrong_code_attempt" }]),
  killed_link: share(7, { mode: "view_only" }, [open(), { step: "kill" }, open(), { step: "open_other_share" }],
    [{ result: "allowed", notify: "first_open" }, { result: "killed" }, { result: "denied:killed", notify: "killed_link_attempt" }, { result: "allowed" }]),
  two_devices: share(7, { mode: "view_only" }, [open(), open({ device: "B" })], [{ result: "allowed", notify: "first_open" }, { result: "allowed", notify: "new_device" }]),
  revoked_then_reshared: share(7, { mode: "view_only" }, [open(), { step: "revoke" }, open(), { step: "reshare" }, { step: "open_other_share" }],
    [{ result: "allowed", notify: "first_open" }, { result: "revoked" }, { result: "denied:revoked", notify: "revoked_link_attempt" }, { result: "new_share_active" }, { result: "allowed" }]),
};

// ─────────────────────────────── NEGATIVE CONTROLS ───────────────────────────────
// Documents that should raise NO alarm at all. Used to count false alarms.

function cleanSet(c: Ctx, p: Person) {
  const built = [idCard(p, c.rng), degreeCertificate(p, c.rng), marksheet(p, c.rng), incomeCertificate(p, c.rng, c.ref, c.rng.int(30, 300)), schoolCertificate(p, c.rng), referenceLetter(p, c.rng, c.ref)];
  const roles = ["id", "degree", "marks", "income", "school", "letter"];
  // The marksheet scan is read cleanly (no misreads), so nothing should be flagged.
  built[2] = { ...built[2], doc: m.ocrNoise(built[2].doc, "clean", c.rng).doc };
  return { built, roles };
}

const NEGATIVE: Record<string, Recipe> = {
  clean: (c) => {
    const { built, roles } = cleanSet(c, c.person());
    return { docs: built.map((b, i) => ({ role: roles[i], doc: b.doc })), registry: built.flatMap((b) => (b.registry ? [b.registry] : [])),
      expected: { detector: "all", docs: roles.map(c.refOf), alarms: 0 } };
  },
  // Looks suspicious, is fine: each case applies ONE benign twist to a clean set.
  near_miss: (c) => {
    const p = c.person();
    const { built, roles } = cleanSet(c, p);
    const kind = c.rng.pick(["honorific_name", "expires_tomorrow", "benign_assistant_letter", "trailing_whitespace", "dob_other_format", "telugu_name_on_letter"]);
    const docs = built.map((b) => b.doc);
    if (kind === "honorific_name") docs[1] = named(docs[1], m.nameHonorific(p, c.rng, bank.honorifics));
    if (kind === "expires_tomorrow") docs[3] = m.setExpiryOffset(docs[3], c.ref, 1);
    if (kind === "benign_assistant_letter") docs[5] = m.injectText(docs[5], "benign_assistant", c.rng);
    if (kind === "trailing_whitespace") docs[1] = m.trailingWhitespace(docs[1], "name");
    if (kind === "dob_other_format") docs[0] = m.setField(docs[0], "dob", formatDate(p.dob, "long"));
    if (kind === "telugu_name_on_letter") docs[5] = m.setField(docs[5], "subject_name", m.nameTelugu(p));
    // The issuer printed these documents as the person holds them, EXCEPT the trailing space,
    // which is a copying slip on the person's side that verification should tolerate.
    const regs = built.flatMap((b, i) => (b.registry ? [{ ...b.registry, fields: kind === "trailing_whitespace" ? b.registry.fields : { ...docs[i].fields } }] : []));
    return { docs: docs.map((d, i) => ({ role: roles[i], doc: d })), registry: regs, expected: { detector: "all", docs: roles.map(c.refOf), alarms: 0, near_miss: kind } };
  },
};

/** The full menu: dimension -> level -> recipe. The coverage report counts cases along these two axes. */
export const MATRIX: Record<string, Record<string, Recipe>> = {
  names: NAMES, dates: DATES, tampering: TAMPERING, ocr: OCR, issuer_state: ISSUER,
  duplicates: DUPLICATES, injection: INJECTION, over_broad: OVER_BROAD, sharing: SHARING, negative_controls: NEGATIVE,
};
