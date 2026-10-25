/**
 * READ FIELDS — turn the lines of text read from an uploaded PDF or photo into document details the person can check.
 *
 * Plain-English picture: certificates mostly print "Label: value" (or "Label - value"). Each such line becomes one
 * detail. Common labels get one standard name (so "Date of Birth", "DOB" and "D.O.B." all become `dob`), others get a
 * tidy name made from the label ("Father's Name" -> `fathers_name`). Nothing is decided here: the person sees every
 * detail, can fix or remove it, and only then saves. The machine's certainty (for photos) travels with each detail.
 */

export interface ReadLine { text: string; confidence?: number }
export interface ReadField { key: string; label: string; value: string; confidence?: number }

/** Standard names for labels that appear on many Indian certificates (matched on letters only, lower case). */
const SYNONYMS: [RegExp, string][] = [
  [/^(name|nameofthecandidate|candidatename|studentname|nameofstudent|holdername)$/, "name"],
  [/^(dob|dateofbirth|birthdate)$/, "dob"],
  [/^(fathersname|fathername|nameofthefather|sonof|so|do)$/, "father_name"],
  [/^(regno|registrationno|registrationnumber|regnumber|registerno|registernumber)$/, "reg_no"],
  [/^(rollno|rollnumber|hallticketno|hallticketnumber)$/, "roll_no"],
  [/^(degree|programme|program|course)$/, "degree"],
  [/^(branch|specialisation|specialization|discipline)$/, "branch"],
  [/^(cgpa|cgpaobtained|gpa)$/, "cgpa"],
  [/^(yearofpassing|passingyear|yearofcompletion)$/, "year_of_passing"],
  [/^(serial|serialno|serialnumber|certificateno|certificatenumber|slno)$/, "serial"],
  [/^(annualincome|income|totalannualincome)$/, "annual_income"],
  [/^(dateofissue|issuedon|issuedate|date)$/, "issued_on"],
  [/^(validupto|validuntil|validtill|validity)$/, "valid_until"],
];

const MAX_FIELDS = 30;

/** "Father's Name" -> its standard name, or a tidy one ("fathers_name"); null when the label has no English letters. */
export function keyFor(label: string): string | null {
  const letters = label.toLowerCase().replace(/[^a-z]/g, "");
  for (const [re, key] of SYNONYMS) if (re.test(letters)) return key;
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return /^[a-z][a-z0-9_]{1,40}$/.test(slug) ? slug : null;
}

/** Every "Label: value" / "Label - value" line becomes a detail; the first value for a name wins; at most 30. */
export function readFields(lines: ReadLine[]): ReadField[] {
  const out: ReadField[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.text.match(/^\s*([^:=\-–]{2,60}?)\s*(?::|=|\s[-–]\s)\s*(.+?)\s*$/);
    if (!m) continue;
    const key = keyFor(m[1]);
    if (!key || seen.has(key) || !m[2].trim()) continue;
    seen.add(key);
    out.push({ key, label: m[1].trim(), value: m[2].replace(/\s+/g, " ").slice(0, 500), ...(line.confidence !== undefined ? { confidence: line.confidence } : {}) });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}
