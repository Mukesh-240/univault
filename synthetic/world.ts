/**
 * WORLD — the building blocks of our fake (synthetic) world.
 *
 * Plain-English picture:
 *   To test UNIVAULT properly we need hundreds of believable but completely invented people and
 *   their documents. This file knows how to:
 *     - invent a person (random name from the name bank, date of birth, ID number, degree, ...),
 *     - write that person's "clean" documents (ID card, degree, marksheet, income certificate, ...),
 *     - and write what the (simulated) issuer has on record for each document.
 *   Other files (mutators.ts) then deliberately damage these clean documents in controlled ways
 *   (a changed digit, an expired date, a misspelt name...) to create test cases.
 *
 * Everything here is driven by a seeded random generator (prng.ts), so the same seed always
 * produces exactly the same people and documents.
 *
 * Nothing here is real: names are random combinations, ID numbers start with 0000, and all
 * institutions are called "Synthetic ..." / "Example ..." / "Sample ...".
 */
import bank from "./name-bank.json";
import type { Rng } from "./prng";

// ─────────────────────────────── Dates ───────────────────────────────
// Internally every date is kept as text in ISO form "YYYY-MM-DD" (e.g. "2026-10-25").
// Documents may *display* dates in other formats; see formatDate below.

/** Turn "YYYY-MM-DD" into a calendar date (midnight UTC, so time zones never shift the day). */
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Turn a calendar date back into "YYYY-MM-DD". */
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** Move a date forward (positive n) or backward (negative n) by n days. */
export const addDays = (iso: string, n: number): string => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };

/** Move a date by n whole years (used for "turns 18 tomorrow" style cases). */
export const addYears = (iso: string, n: number): string => { const d = toDate(iso); d.setUTCFullYear(d.getUTCFullYear() + n); return toIso(d); };

/** The different ways a date can be printed on a document. */
export type DateFormat = "iso" | "dmy" | "dmy_slash" | "long" | "te_digits";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Telugu digits (Unicode U+0C66 to U+0C6F), built from their code numbers so they are easy to review. */
const TE_DIGITS = Array.from({ length: 10 }, (_, i) => String.fromCodePoint(0x0c66 + i));

/**
 * Print a date in a chosen style:
 *   iso       -> 2003-05-14
 *   dmy       -> 14-05-2003
 *   dmy_slash -> 14/05/2003
 *   long      -> 14 May 2003
 *   te_digits -> 14-05-2003 written with Telugu digits
 */
export function formatDate(iso: string, fmt: DateFormat): string {
  const [y, m, d] = iso.split("-");
  switch (fmt) {
    case "iso": return iso;
    case "dmy": return `${d}-${m}-${y}`;
    case "dmy_slash": return `${d}/${m}/${y}`;
    case "long": return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
    case "te_digits": return `${d}-${m}-${y}`.replace(/\d/g, (c) => TE_DIGITS[Number(c)]);
  }
}

// ─────────────────────────────── People ───────────────────────────────

/** One name part from the name bank: its Latin spelling, Telugu spelling and alternative spellings. */
export interface NameToken { latin: string; te: string; variants: string[] }

/** An invented person, with everything their documents will need. */
export interface Person {
  given: NameToken[];      // first/middle names
  surname: NameToken;      // family name
  dob: string;             // date of birth, ISO
  idNumber: string;        // fake 12-digit ID "0000 1234 5678" (always starts with 0000 so it can't be real)
  place: string;           // fictional address
  regNo: string;           // university registration number
  degree: string;          // e.g. B.Tech
  branch: string;          // e.g. Computer Science
  cgpa: string;            // grade point average as text, e.g. "8.41"
  yearOfPassing: string;   // e.g. "2025"
  income: string;          // family annual income in rupees, as text
  rollNo: string;          // school-board roll number
}

export const GIVEN: NameToken[] = bank.given;
export const SURNAMES: NameToken[] = bank.surnames;
/** The name parts people are drawn from (the metamorphic test swaps in a renamed copy). */
export interface NamePool { given: NameToken[]; surnames: NameToken[] }

/**
 * Invent a person. `ref` is "today" for this dataset; ages are worked out relative to it.
 * Options let a recipe ask for a specific number of given names, or force particular name parts
 * (e.g. "a different person who shares the same first names").
 */
export function makePerson(rng: Rng, ref: string, opts: { givenCount?: number; given?: NameToken[]; surname?: NameToken; pool?: NamePool } = {}): Person {
  const pool = opts.pool ?? { given: GIVEN, surnames: SURNAMES };
  const count = opts.givenCount ?? rng.pick([1, 2, 2, 2, 3]);
  // Shuffle the bank and take the first few, so the same given name never appears twice.
  const given = opts.given ?? rng.shuffle(pool.given).slice(0, count);
  const surname = opts.surname ?? rng.pick(pool.surnames);
  const age = rng.int(20, 26);
  return {
    given, surname,
    dob: addDays(addYears(ref, -age), -rng.int(1, 360)),
    idNumber: `0000 ${rng.digits(4)} ${rng.digits(4)}`,
    place: `${rng.int(1, 99)}-${rng.int(1, 40)}, ${rng.pick(bank.places)}`,
    regNo: `${rng.int(18, 22)}SSU${rng.digits(5)}`,
    degree: rng.pick(bank.degrees),
    branch: rng.pick(bank.branches),
    cgpa: (rng.int(600, 980) / 100).toFixed(2),
    yearOfPassing: String(Number(ref.slice(0, 4)) - rng.int(0, 2)),
    income: String(rng.int(80, 450) * 1000),
    rollNo: `${rng.digits(2)}${rng.int(100000, 999999)}`,
  };
}

/** The person's name written normally in Latin letters: given names, then surname. */
export const latinName = (p: Person): string => [...p.given.map((g) => g.latin), p.surname.latin].join(" ");
/** The person's name written in Telugu script. */
export const teluguName = (p: Person): string => [...p.given.map((g) => g.te), p.surname.te].join(" ");

// ─────────────────────────────── Documents ───────────────────────────────

/**
 * A document as the person holds it (what gets uploaded). This matches the shape that
 * src/lib/ingest.ts accepts, minus the labels the generator adds at the end.
 */
export interface DocDraft {
  doc_type: string;
  title: string;
  issuer: string | null;
  serial: string | null;
  capture: "digital" | "scan";
  fields: Record<string, string>;
  body_text?: string;
  hidden_text?: string;
  ocr_confidence?: Record<string, number> | null;
  language_scripts: ("latin" | "telugu")[];
}

/**
 * What the simulated issuer has on record for a document (its "registry entry").
 * `signer: "rogue"` means the entry will be signed with the WRONG key, to test that a forged
 * registry reply is rejected.
 */
export interface RegDraft {
  serial: string;
  doc_type: string;
  issuer_name: string;
  fields: Record<string, string>;
  status: "active" | "superseded" | "revoked";
  superseded_by: string | null;
  version: number;
  signer: "issuer" | "rogue";
}

/** A document plus (if it has an issuer) the issuer's record of it. */
export interface Built { doc: DocDraft; registry: RegDraft | null }

/** The issuer's record is simply a copy of the true fields at the moment of issue. */
const record = (doc: DocDraft): RegDraft => ({
  serial: doc.serial!, doc_type: doc.doc_type, issuer_name: doc.issuer!, fields: { ...doc.fields },
  status: "active", superseded_by: null, version: 1, signer: "issuer",
});

/** Default reading-confidence for a clean scan: high on every field. OCR mutators lower these. */
const cleanConfidence = (fields: Record<string, string>) => Object.fromEntries(Object.keys(fields).map((k) => [k, 0.97]));

/** National-ID-style card (simulated). Date of birth printed as DD-MM-YYYY. */
export function idCard(p: Person, rng: Rng): Built {
  const doc: DocDraft = {
    doc_type: "id_card", title: "Identity card", issuer: bank.issuers.identity, serial: `SIA-${rng.digits(8)}`, capture: "digital",
    fields: { name: latinName(p), dob: formatDate(p.dob, "dmy"), id_number: p.idNumber, address: p.place },
    language_scripts: ["latin"],
  };
  return { doc, registry: record(doc) };
}

/** Degree certificate, as a digital original from the university. */
export function degreeCertificate(p: Person, rng: Rng): Built {
  const serial = `SSU-DEG-${rng.digits(6)}`;
  const doc: DocDraft = {
    doc_type: "degree_certificate", title: "Degree certificate", issuer: bank.issuers.university, serial, capture: "digital",
    fields: { name: latinName(p), reg_no: p.regNo, degree: p.degree, branch: p.branch, cgpa: p.cgpa, year_of_passing: p.yearOfPassing, serial },
    language_scripts: ["latin"],
  };
  return { doc, registry: record(doc) };
}

/** Final-semester marksheet. It is a SCAN (paper photographed), bilingual: name in English and Telugu. */
export function marksheet(p: Person, rng: Rng): Built {
  const serial = `SSU-MS-${rng.digits(6)}`;
  const doc: DocDraft = {
    doc_type: "marksheet", title: "Marksheet (semester 8)", issuer: bank.issuers.university, serial, capture: "scan",
    fields: { name: latinName(p), name_te: teluguName(p), reg_no: p.regNo, semester: "8", total_marks: String(rng.int(480, 780)), result: "PASS", serial },
    language_scripts: ["latin", "telugu"],
  };
  // The issuer's record holds the TRUE values; the scan's text may later be damaged by OCR mutators.
  return { doc: { ...doc, ocr_confidence: cleanConfidence(doc.fields) }, registry: record(doc) };
}

/**
 * Income certificate. `validDays` = how many days from `ref` (today) until it expires;
 * negative means it already expired that many days ago. It is issued one year before expiry.
 */
export function incomeCertificate(p: Person, rng: Rng, ref: string, validDays: number): Built {
  const serial = `SRD-INC-${rng.digits(6)}`;
  const validUntil = addDays(ref, validDays);
  const doc: DocDraft = {
    doc_type: "income_certificate", title: "Income certificate", issuer: bank.issuers.revenue, serial, capture: "digital",
    fields: { name: latinName(p), annual_income: p.income, issued_on: addDays(validUntil, -365), valid_until: validUntil, serial },
    language_scripts: ["latin"],
  };
  return { doc, registry: record(doc) };
}

/** Provisional certificate (issued before the final degree; usually replaced by it later). */
export function provisionalCertificate(p: Person, rng: Rng): Built {
  const serial = `SSU-PROV-${rng.digits(6)}`;
  const doc: DocDraft = {
    doc_type: "provisional_certificate", title: "Provisional certificate", issuer: bank.issuers.university, serial, capture: "digital",
    fields: { name: latinName(p), reg_no: p.regNo, degree: p.degree, year_of_passing: p.yearOfPassing, serial },
    language_scripts: ["latin"],
  };
  return { doc, registry: record(doc) };
}

/** School-board (class 10) certificate. Prints the date of birth in ISO style (YYYY-MM-DD). */
export function schoolCertificate(p: Person, rng: Rng): Built {
  const serial = `SBSE-${rng.digits(7)}`;
  const doc: DocDraft = {
    doc_type: "school_certificate", title: "Secondary school certificate", issuer: bank.issuers.school_board, serial, capture: "digital",
    fields: { name: latinName(p), dob: formatDate(p.dob, "iso"), roll_no: p.rollNo, year: String(Number(p.yearOfPassing) - 6), result: "PASS", serial },
    language_scripts: ["latin"],
  };
  return { doc, registry: record(doc) };
}

/** Transfer certificate from the university (an ordinary, problem-free document). */
export function transferCertificate(p: Person, rng: Rng): Built {
  const serial = `SSU-TC-${rng.digits(6)}`;
  const doc: DocDraft = {
    doc_type: "transfer_certificate", title: "Transfer certificate", issuer: bank.issuers.university, serial, capture: "digital",
    fields: { name: latinName(p), reg_no: p.regNo, conduct: "Good", year_of_leaving: p.yearOfPassing, serial },
    language_scripts: ["latin"],
  };
  return { doc, registry: record(doc) };
}

/** Ordinary sentences for reference letters. Picked at random so letters differ. */
const LETTER_LINES = [
  "has been a sincere and hard-working student throughout the programme.",
  "completed the final-year project on time and presented it clearly.",
  "showed good teamwork during laboratory sessions.",
  "maintained regular attendance and good conduct.",
  "took part in the departmental technical festival as a volunteer.",
];

/**
 * Reference letter written by a (fictional) head of department. Letters have no issuer serial,
 * so they can't be checked against a registry; they are plain text. `name` lets a recipe write
 * the person's name differently (e.g. reordered).
 */
export function referenceLetter(p: Person, rng: Rng, ref: string, name = latinName(p)): Built {
  const lines = rng.shuffle(LETTER_LINES).slice(0, 3).map((l) => `${name} ${l}`);
  const doc: DocDraft = {
    doc_type: "reference_letter", title: "Reference letter", issuer: null, serial: null, capture: "digital",
    fields: { author: `Head of Department, ${bank.issuers.university}`, subject_name: name, date: addDays(ref, -rng.int(10, 120)) },
    body_text: `To whom it may concern,\n${lines.join("\n")}\nI recommend the candidate without reservation.`,
    language_scripts: ["latin"],
  };
  return { doc, registry: null };
}

/** The three fictional recipients (organisations asking for documents). */
export const RECIPIENTS: { name: string; purpose: string }[] = bank.recipients;
