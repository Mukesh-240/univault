/**
 * SHOWCASE — the "graduate_demo" recipe used in the live demo.
 *
 * Plain-English picture:
 *   The challenge brief describes one graduate whose documents are a mess: a degree with the name
 *   spelt differently from the ID, a poor bilingual marksheet scan, an income certificate that
 *   expired 9 days ago, a letter hiding instructions, and so on. This recipe builds exactly that
 *   situation for a RANDOM invented person — using the very same generic mutators as the
 *   hundreds of test cases. Nothing about the demo person is typed in by hand.
 *
 *   It also writes the list of the 17 planted conflicts from spec section 6 (with the detector
 *   expected to catch each) and the 3 negative-control documents that must raise no alarm.
 *   That list goes to the labels file only, and docs/DATA_CARD.md is generated from it.
 */
import bank from "./name-bank.json";
import * as m from "./mutators";
import { MINIMAL, type CaseOut, type Ctx, type ScenarioDraft } from "./recipes";
import {
  degreeCertificate, idCard, incomeCertificate, marksheet, provisionalCertificate, referenceLetter,
  schoolCertificate, transferCertificate, type DocDraft,
} from "./world";

/** One planted problem, as listed in the data card. */
export interface Conflict { id: number; title: string; detector: string; refs: string[]; expected: Record<string, unknown> }

/** Used only to make sure the demo scan actually HAS a low-confidence field to show. */
const LOW_CONFIDENCE = 0.7;

export function graduateDemo(c: Ctx): CaseOut & { conflicts: Conflict[]; negatives: { ref: string; why: string }[] } {
  const p = c.person({ givenCount: 2 });
  const r = c.refOf;

  // ── The documents ──────────────────────────────────────────────────────────
  // ID card: carries the SHORT form of the name (first given name + surname). [conflict 1]
  const id = idCard(p, c.rng);
  const idDoc = m.setField(id.doc, "name", m.nameShort(p));

  // Degree certificate: digital original, full name.
  const degree = degreeCertificate(p, c.rng);

  // The same degree as received by email, with ONE digit of the CGPA altered. [conflict 8]
  const copyDoc: DocDraft = { ...m.alterDigit(degree.doc, "cgpa", c.rng), title: "Degree certificate (copy received by email)" };

  // Marksheet scan: name as "Initial. Given names" [2], Telugu name [3], poor scan with a misread digit [6, 7].
  const ms = marksheet(p, c.rng);
  const msTrue = m.setField(ms.doc, "name", m.nameInitialSurname(p));
  // Re-roll the scan quality until it shows both a misread AND a low-confidence field.
  // (Still fully determined by the seed; this only guarantees the demo shows what the brief describes.)
  let scan = m.ocrNoise(msTrue, "digit_confusion", c.rng);
  for (let i = 0; i < 50 && !(scan.misread.length && Object.values(scan.doc.ocr_confidence ?? {}).some((v) => v < LOW_CONFIDENCE)); i++)
    scan = m.ocrNoise(msTrue, "digit_confusion", c.rng);

  // Income certificate that expired 9 days ago [5]; its registry reply carries an INVALID signature [17].
  const income = incomeCertificate(p, c.rng, c.ref, -9);

  // Provisional certificate, superseded by the final degree [10].
  const prov = provisionalCertificate(p, c.rng);

  // Reference letter: name in a different word order [4] and hidden instruction text [11].
  const letter = referenceLetter(p, c.rng, c.ref, m.nameReordered(p));
  const letterDoc = m.injectText(letter.doc, "hidden_text", c.rng);

  // A re-scan of the degree certificate (same paper, photographed) [9].
  const rescan = m.duplicate(degree.doc, "rescan", c.rng);

  // Negative controls: should raise NO alarm.
  const school = schoolCertificate(p, c.rng);            // DOB printed YYYY-MM-DD while the ID prints DD-MM-YYYY [13]
  const tc = transferCertificate(p, c.rng);              // an ordinary, clean certificate
  const bona = referenceLetter(p, c.rng, c.ref);         // a letter that merely mentions an "assistant"
  const bonaDoc: DocDraft = { ...m.injectText(bona.doc, "benign_assistant", c.rng), title: "Bonafide letter" };

  const docs = [
    { role: "id", doc: idDoc }, { role: "degree", doc: degree.doc }, { role: "degree_copy", doc: copyDoc },
    { role: "marksheet", doc: scan.doc }, { role: "income", doc: income.doc }, { role: "provisional", doc: prov.doc },
    { role: "letter", doc: letterDoc }, { role: "degree_rescan", doc: rescan },
    { role: "school", doc: school.doc }, { role: "transfer", doc: tc.doc }, { role: "bonafide", doc: bonaDoc },
  ];

  // ── What the simulated issuer has on record ─────────────────────────────────
  const registry = [
    { ...id.registry!, fields: { ...idDoc.fields } },
    degree.registry!,
    { ...ms.registry!, fields: { ...msTrue.fields } },               // the TRUE marksheet values (before OCR damage)
    m.forge(income.registry!),
    m.supersede(prov.registry!, degree.doc.serial!),
    school.registry!, tc.registry!,
  ];

  // ── A recipient asking for too much: the scholarship body wants the FULL ID number [12] ──
  const requested = [...MINIMAL.scholarship.filter((x) => x !== "id_card.id_number_last4"), "id_card.id_number"];
  const requests = [{ role: "scholarship_request", recipient_purpose: "scholarship", purpose: "scholarship", requested, doc_roles: ["id", "income", "marksheet"] }];

  // ── A share with the job recipient that later leaks [15, 16] ──
  const scenarios: ScenarioDraft[] = [{
    role: "job_share", doc_roles: ["degree"], recipient_purpose: "job", expiry_days: 14, policy: { mode: "view_only" },
    actions: [
      { step: "open", actor: "recipient", device: "A", recipient_id: "correct", otp: "fresh" },  // 1: genuine recipient
      { step: "open", actor: "recipient", device: "B", recipient_id: "correct", otp: "fresh" },  // 2: second device -> notify
      { step: "open", actor: "stranger", device: "B", recipient_id: "wrong", otp: "wrong" },     // 3: forwarded to a stranger -> denied
      { step: "kill" },                                                                          // 4: owner kills this link
      { step: "open", actor: "recipient", device: "A", recipient_id: "correct", otp: "fresh" },  // 5: killed link -> denied
    ],
  }];

  // ── The 17 planted conflicts (spec section 6), each with the detector that should catch it ──
  const conflicts: Conflict[] = [
    { id: 1, title: "Degree has the full name; ID card has a shorter form", detector: "name_match", refs: [r("id"), r("degree")], expected: { same_person: true, needs_user_link: true } },
    { id: 2, title: "Marksheet uses an initial for the surname", detector: "name_match", refs: [r("marksheet"), r("degree")], expected: { same_person: true, explanation: "initial expansion" } },
    { id: 3, title: "Marksheet also gives the name in Telugu script", detector: "name_match", refs: [r("marksheet"), r("degree")], expected: { same_person: true, explanation: "transliteration" } },
    { id: 4, title: "Reference letter writes the name in a different word order", detector: "name_match", refs: [r("letter"), r("degree")], expected: { same_person: true, explanation: "same words, different order" } },
    { id: 5, title: "Income certificate expired 9 days ago", detector: "not_expired", refs: [r("income")], expected: { result: "fail", days_expired: 9 } },
    { id: 6, title: "Marksheet scan has fields below the confidence threshold", detector: "ocr_confidence", refs: [r("marksheet")], expected: { scan_confirmed_rule: "unknown" } },
    { id: 7, title: "Marksheet field misread by OCR (digit confusion)", detector: "ocr_correction", refs: [r("marksheet")], expected: { misread_fields: [...scan.misread].sort(), correction_is_separate_assertion: true } },
    { id: 8, title: "Degree copy has one altered digit vs the issuer record", detector: "issuer_verify", refs: [r("degree_copy")], expected: { state: "tamper_flagged", mismatched_fields: ["cgpa"] } },
    { id: 9, title: "Duplicate: re-scan of the degree certificate", detector: "duplicate", refs: [r("degree"), r("degree_rescan")], expected: { kind: "rescan" } },
    { id: 10, title: "Provisional certificate superseded by the final degree", detector: "issuer_verify", refs: [r("provisional")], expected: { state: "superseded" } },
    { id: 11, title: "Reference letter contains hidden instruction text", detector: "injection", refs: [r("letter")], expected: { flagged: true, share_created: false } },
    { id: 12, title: "Scholarship recipient asks for the full ID number", detector: "over_broad", refs: [r("scholarship_request")], expected: { flagged: true, extra: ["id_card.id_number"], minimal_alternative: "id_card.id_number_last4" } },
    { id: 13, title: "Date of birth printed DD-MM-YYYY on the ID and YYYY-MM-DD on the school certificate", detector: "dob_consistent", refs: [r("id"), r("school")], expected: { result: "consistent", false_mismatch: false } },
    { id: 14, title: "Issuer unreachable at submission time", detector: "issuer_verify", refs: [r("degree")], expected: { state: "unverifiable", reason: "issuer_unreachable", condition: { issuer_down: true }, retry_scheduled: true } },
    { id: 15, title: "Share link opened from a second device", detector: "share_access", refs: [r("job_share")], expected: { step: 2, result: "allowed", notify: "new_device", leak_trace_resolves: true } },
    { id: 16, title: "Wrong recipient ID, then an attempt on the killed link", detector: "share_access", refs: [r("job_share")], expected: { steps: { 3: "denied:wrong_recipient", 5: "denied:killed" }, notify: ["wrong_recipient_attempt", "killed_link_attempt"] } },
    { id: 17, title: "Registry reply for the income certificate has an invalid signature", detector: "issuer_verify", refs: [r("income")], expected: { state: "unverifiable", reason: "signature_invalid" } },
  ];
  const negatives = [
    { ref: r("school"), why: "Clean school certificate; DOB in a different format must not be called a mismatch" },
    { ref: r("transfer"), why: "Clean transfer certificate; verifies against the issuer" },
    { ref: r("bonafide"), why: "Letter that mentions an 'assistant' innocently; must not be flagged as injection" },
  ];

  return { docs, registry, requests, scenarios, conflicts, negatives, expected: { detector: "showcase", conflicts: conflicts.length, negatives: negatives.length } };
}

/** The fictional recipients from the name bank (the generator gives each a recipient code). */
export const RECIPIENT_BANK = bank.recipients;
