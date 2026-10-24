import { describe, expect, it } from "vitest";
import { findLeaks, log, logBuffer, redact } from "../src/lib/scrub";

describe("redact", () => {
  it.each([
    ["id 0000 1234 5678", "[REDACTED-ID]"],
    ["id 000012345678", "[REDACTED-ID]"],
    ["mail a.b@example.org", "[REDACTED-EMAIL]"],
    ["call +91 9876543210", "[REDACTED-PHONE]"],
    ["dob 2003-05-14", "[REDACTED-DATE]"],
    ["dob 14-05-2003", "[REDACTED-DATE]"],
    ["dob 14/05/2003", "[REDACTED-DATE]"],
    ["dob 5 May 2003", "[REDACTED-DATE]"],
    ["token " + "a".repeat(43), "[REDACTED-TOKEN]"],
  ])("redacts %s", (input, tag) => {
    const out = redact(input);
    expect(out).toContain(tag);
  });
  it("redacts caller-supplied values, longest first", () => {
    expect(redact("name Sai Krishna Test", ["Sai", "Sai Krishna Test"])).toBe("name [REDACTED]");
  });
});

describe("log + findLeaks", () => {
  it("never keeps sensitive values in the buffer", () => {
    const secret = { id: "0000 1111 2222", name: "Unit Test Person", dob: "01-02-2003" };
    log("info", "upload", secret, [secret.name]);
    expect(findLeaks(logBuffer, Object.values(secret))).toEqual([]);
  });
  it("finds a leak when one exists", () => {
    expect(findLeaks(["x 0000 1111 2222 y"], ["0000 1111 2222"])).toEqual(["0000 1111 2222"]);
  });
});
