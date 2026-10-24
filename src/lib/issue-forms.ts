/**
 * ISSUE FORMS — what an issuer fills in for each kind of document, and the checks on it.
 *
 * Plain-English picture: for each document type the issuer can create, this lists the boxes (name, number, date...)
 * and what a sensible value looks like. The same list draws the form in the browser and re-checks the answers on the
 * server before anything is signed, so a bad value can never be signed by skipping the screen. The labels people
 * read come from the locale files (field.<name>); this file only holds the shape.
 * It makes no decision about any document: it only says "this box needs a date" and "this date is not a date".
 */
export type FieldKind = "text" | "date" | "number" | "year" | "choice";
export interface FieldSpec { key: string; kind: FieldKind; choices?: string[]; maxLength?: number; fromHolderName?: boolean }
export interface FormSpec { fields: FieldSpec[] }

const name: FieldSpec = { key: "name", kind: "text", maxLength: 80, fromHolderName: true };
const reg: FieldSpec = { key: "reg_no", kind: "text", maxLength: 30 };
const degree: FieldSpec = { key: "degree", kind: "text", maxLength: 40 };
const passYear: FieldSpec = { key: "year_of_passing", kind: "year" };

/** The documents an issuer can create (the digital kinds an issuer signs). */
export const FORMS: Record<string, FormSpec> = {
  degree_certificate: { fields: [name, reg, degree, { key: "branch", kind: "text", maxLength: 60 }, { key: "cgpa", kind: "number" }, passYear] },
  provisional_certificate: { fields: [name, reg, degree, passYear] },
  income_certificate: { fields: [name, { key: "annual_income", kind: "number" }, { key: "issued_on", kind: "date" }, { key: "valid_until", kind: "date" }] },
  school_certificate: { fields: [name, { key: "dob", kind: "date" }, { key: "roll_no", kind: "text", maxLength: 30 }, { key: "year", kind: "year" }, { key: "result", kind: "choice", choices: ["PASS", "FAIL"] }] },
  transfer_certificate: { fields: [name, reg, { key: "conduct", kind: "choice", choices: ["Excellent", "Good", "Satisfactory"] }, { key: "year_of_leaving", kind: "year" }] },
};
export const ISSUABLE_TYPES = Object.keys(FORMS);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9 ./-]*$/;

/** A real calendar date written YYYY-MM-DD (30 February is not one). */
export function isIsoDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export type FieldProblem = "required" | "bad_date" | "bad_number" | "bad_year" | "bad_choice" | "too_long" | "bad_chars" | "before_start";
export interface FormCheck { ok: boolean; problems: Record<string, FieldProblem>; clean: Record<string, string> }

/** Check one form: `clean` is the trimmed text that will be signed. Unknown boxes are ignored, missing ones are problems. */
export function checkForm(docType: string, answers: Record<string, string>): FormCheck {
  const spec = FORMS[docType];
  const problems: Record<string, FieldProblem> = {};
  const clean: Record<string, string> = {};
  if (!spec) return { ok: false, problems: { _type: "bad_choice" }, clean };
  for (const f of spec.fields) {
    const v = (answers[f.key] ?? "").trim();
    clean[f.key] = v;
    if (!v) { problems[f.key] = "required"; continue; }
    if (f.kind === "text") {
      if (v.length > (f.maxLength ?? 80)) problems[f.key] = "too_long";
      else if (f.key !== "name" && !CODE.test(v)) problems[f.key] = "bad_chars";
    } else if (f.kind === "date" && !isIsoDate(v)) problems[f.key] = "bad_date";
    else if (f.kind === "number" && !/^\d{1,9}(\.\d{1,2})?$/.test(v)) problems[f.key] = "bad_number";
    else if (f.kind === "year" && !(/^\d{4}$/.test(v) && Number(v) >= 1950 && Number(v) <= 2100)) problems[f.key] = "bad_year";
    else if (f.kind === "choice" && !f.choices?.includes(v)) problems[f.key] = "bad_choice";
  }
  // An income certificate cannot end before it starts.
  if (docType === "income_certificate" && !problems.issued_on && !problems.valid_until && clean.valid_until < clean.issued_on) problems.valid_until = "before_start";
  return { ok: Object.keys(problems).length === 0, problems, clean };
}

/** Which letters make a serial prefix: the first letter of each word of a name ("Some State University" becomes "SSU"). */
export const initialsOf = (s: string) => s.split(/[^A-Za-z]+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 5) || "ISS";
