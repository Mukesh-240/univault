/** READ FIELDS — "Label: value" lines from an uploaded PDF or photo become details with standard names; nothing is invented. */
import { describe, expect, it } from "vitest";
import { keyFor, readFields } from "../src/lib/read-fields";

describe("readFields", () => {
  it("turns certificate lines into standard details and keeps the reader's certainty", () => {
    const f = readFields([
      { text: "VELLORE INSTITUTE OF TECHNOLOGY" },
      { text: "Name of the Candidate : Mahesh Mekhala", confidence: 0.93 },
      { text: "Registration No: 21BCE1234" },
      { text: "Date of Birth - 04-03-2003" },
      { text: "Father's Name: R. Mekhala" },
      { text: "CGPA: 8.71" },
    ]);
    expect(f.map((x) => [x.key, x.value])).toEqual([["name", "Mahesh Mekhala"], ["reg_no", "21BCE1234"], ["dob", "04-03-2003"], ["father_name", "R. Mekhala"], ["cgpa", "8.71"]]);
    expect(f[0].confidence).toBe(0.93);
  });
  it("skips lines without a label, keeps the first value for a name, and never invents a detail", () => {
    expect(readFields([{ text: "Certificate of Degree" }, { text: "DOB: 01-01-2000" }, { text: "D.O.B.: 02-02-2002" }]).map((x) => x.value)).toEqual(["01-01-2000"]);
    expect(readFields([])).toEqual([]);
  });
  it("names an unknown label tidily, and refuses a label with no English letters", () => {
    expect(keyFor("Mother's Name")).toBe("mother_s_name");
    expect(keyFor("పేరు")).toBeNull();
  });
});
