/**
 * SIGN-IN tests (session.ts, gate.ts, rate-limit.ts lock, person.ts, i18n.ts first-visit language).
 * In plain words, these check that:
 *   - a session cookie made with the server secret is accepted, and one that is forged, edited, signed
 *     with another secret, wrongly typed or expired is refused;
 *   - the cookie holds only the last four digits of the number, never the whole thing;
 *   - which addresses need a session: pages go to /signin, APIs get 401, and the public ones
 *     (/s/…, /api/health, the cron route, /api/auth/*, /threat-model, /policy, /signin) stay open;
 *   - 5 wrong codes lock a sign-in for 15 minutes, exactly; a success starts the count again;
 *   - the greeting's name and the consent record come from the vault's identity card;
 *   - a browser whose first language is Telugu gets Telugu on a first visit.
 */
import cast from "../src/config/demo-cast.json";
import { describe, expect, it } from "vitest";
import { areaOf, gateFor, homeFor, isPublicPath } from "../src/lib/gate";
import { preferredLang } from "../src/lib/i18n";
import { personRecord } from "../src/lib/person";
import { clearFailures, lockState, recordFailure, SIGNIN_LOCK } from "../src/lib/rate-limit";
import { fingerprint, open, sameString, seal, type ChallengePayload, type SessionPayload } from "../src/lib/session";
import { generate } from "../src/lib/synthetic-aadhaar";

const SECRET = "test-secret-one";
const NOW = 1_800_000_000; // seconds
const session = (over: Partial<SessionPayload> = {}): SessionPayload => ({ kind: "session", last4: "5678", name: "Asha Rao", iat: NOW, exp: NOW + 3600, ...over });

describe("session cookie", () => {
  it("accepts one made with the secret, and gives back what was put in", async () => {
    const token = await seal(session(), SECRET);
    expect(await open<SessionPayload>(token, "session", SECRET, NOW * 1000)).toEqual(session());
  });

  it("refuses forged, edited, wrongly typed and expired cookies", async () => {
    const token = await seal(session(), SECRET);
    const [body, sig] = token.split(".");
    const edited = Buffer.from(JSON.stringify(session({ last4: "0000" }))).toString("base64url");
    expect(await open(token, "session", "another-secret", NOW * 1000)).toBeNull();
    expect(await open(`${edited}.${sig}`, "session", SECRET, NOW * 1000)).toBeNull();
    expect(await open(`${body}.AAAA`, "session", SECRET, NOW * 1000)).toBeNull();
    expect(await open("garbage", "session", SECRET, NOW * 1000)).toBeNull();
    expect(await open(undefined, "session", SECRET, NOW * 1000)).toBeNull();
    expect(await open(token, "session", SECRET, (NOW + 3601) * 1000)).toBeNull(); // expired
    // A sign-in-in-progress cookie can never be used as a session.
    const chal: ChallengePayload = { kind: "challenge", stage: "verified", nm: "n", cm: "c", last4: "5678", exp: NOW + 3600 };
    expect(await open(await seal(chal, SECRET), "session", SECRET, NOW * 1000)).toBeNull();
  });

  it("never holds the whole number", async () => {
    const number = generate();
    const nm = await fingerprint(SECRET, "number", number);
    const chal: ChallengePayload = { kind: "challenge", stage: "code", nm, cm: await fingerprint(SECRET, "code", "123456"), last4: number.slice(-4), exp: NOW + 600 };
    const decoded = Buffer.from((await seal(chal, SECRET)).split(".")[0], "base64url").toString();
    expect(decoded).not.toContain(number);
    expect(decoded).not.toContain("123456");
    expect(decoded).toContain(number.slice(-4));
  });

  it("fingerprints are keyed: same value + secret match, a different secret or label does not", async () => {
    const a = await fingerprint(SECRET, "code", "123456");
    expect(await fingerprint(SECRET, "code", "123456")).toBe(a);
    expect(await fingerprint("other", "code", "123456")).not.toBe(a);
    expect(await fingerprint(SECRET, "number", "123456")).not.toBe(a);
    expect(sameString(a, a)).toBe(true);
    expect(sameString(a, `${a}x`)).toBe(false);
  });
});

describe("which addresses need a session", () => {
  it("pages go to /signin, APIs get 401, without a session", () => {
    for (const p of ["/", "/readiness", "/shares", "/share", "/ocr", "/doc/abc"]) expect(gateFor(p, null), p).toBe("signin");
    for (const p of ["/api/upload", "/api/share/confirm", "/api/verify", "/api/shares/kill", "/api/notifications"]) expect(gateFor(p, null), p).toBe("unauthorized");
  });

  it("recipient links, health, cron, sign-in and the trust pages stay open", () => {
    for (const p of ["/s/abc123", "/s/abc123/download", "/s/preview", "/api/health", "/api/cron/recheck", "/api/auth/code", "/api/auth/verify", "/signin", "/threat-model", "/policy"]) {
      expect(isPublicPath(p), p).toBe(true);
      expect(gateFor(p, null), p).toBe("allow");
    }
    // Look-alikes are not open.
    for (const p of ["/s", "/api/healthz", "/api/cronjob", "/signin/x", "/policy/x"]) expect(isPublicPath(p), p).toBe(false);
  });

  it("a sender opens the vault and the receiving area; /signin sends any role home", () => {
    for (const p of ["/", "/shares", "/api/upload", "/receive", "/api/receive/shares"]) expect(gateFor(p, "sender"), p).toBe("allow");
    for (const r of ["sender", "issuer", "receiver"] as const) expect(gateFor("/signin", r)).toBe("home");
  });
});

describe("role guards", () => {
  it("an issuer opens only the issuer area; / goes to /issuer; vault pages and APIs are refused", () => {
    for (const p of ["/issuer", "/issuer/issue", "/api/issuer-portal/issue", "/area"]) expect(gateFor(p, "issuer"), p).toBe("allow");
    expect(gateFor("/", "issuer")).toBe("redirect");
    expect(homeFor("issuer")).toBe("/issuer");
    for (const p of ["/shares", "/doc/abc", "/receive", "/api/verify", "/api/receive/x"]) expect(gateFor(p, "issuer"), p).toBe("forbidden");
  });

  it("a receiver opens only the receiving area and cannot reach a vault or the issuer area", () => {
    for (const p of ["/receive", "/receive/abc", "/api/receive/ask", "/area"]) expect(gateFor(p, "receiver"), p).toBe("allow");
    expect(gateFor("/", "receiver")).toBe("redirect");
    for (const p of ["/shares", "/doc/abc", "/share", "/issuer", "/api/issuer-portal/issue", "/api/share/confirm"]) expect(gateFor(p, "receiver"), p).toBe("forbidden");
  });

  it("a sender cannot open the issuer area", () => {
    for (const p of ["/issuer", "/issuer/issue", "/api/issuer-portal/revoke"]) expect(gateFor(p, "sender"), p).toBe("forbidden");
    expect(areaOf("/api/issuer/lookup")).toBe("sender"); // the simulated issuer's public registry stays a vault-side call
  });
});

describe("5 wrong codes lock a sign-in for 15 minutes", () => {
  it("locks on the 5th, lasts exactly 15 minutes, then opens again", () => {
    const key = `test|${Math.random()}`;
    const T = 1_000_000;
    expect(SIGNIN_LOCK).toEqual({ max: 5, lockMs: 15 * 60_000 });
    for (let i = 1; i <= 4; i++) expect(recordFailure(key, SIGNIN_LOCK, T + i)).toMatchObject({ locked: false, left: 5 - i });
    expect(lockState(key, T + 10).locked).toBe(false);
    expect(recordFailure(key, SIGNIN_LOCK, T + 5)).toMatchObject({ locked: true, retryAfterS: 900 });
    expect(lockState(key, T + 60_000)).toEqual({ locked: true, retryAfterS: 841 }); // 840.005 s left, rounded up
    expect(lockState(key, T + 5 + SIGNIN_LOCK.lockMs - 1).locked).toBe(true);
    expect(lockState(key, T + 5 + SIGNIN_LOCK.lockMs).locked).toBe(false);
  });

  it("a success starts the count again, and other numbers are not affected", () => {
    const a = `a|${Math.random()}`, b = `b|${Math.random()}`;
    for (let i = 0; i < 4; i++) recordFailure(a, SIGNIN_LOCK, 1000 + i);
    clearFailures(a);
    expect(recordFailure(a, SIGNIN_LOCK, 2000)).toMatchObject({ locked: false, left: 4 });
    for (let i = 0; i < 5; i++) recordFailure(b, SIGNIN_LOCK, 3000 + i);
    expect(lockState(b, 4000).locked).toBe(true);
    expect(lockState(a, 4000).locked).toBe(false);
  });

  it("old failures are forgotten after 15 quiet minutes", () => {
    const key = `old|${Math.random()}`;
    for (let i = 0; i < 4; i++) recordFailure(key, SIGNIN_LOCK, 1000 + i);
    expect(recordFailure(key, SIGNIN_LOCK, 1000 + SIGNIN_LOCK.lockMs + 10)).toMatchObject({ locked: false, left: 4 });
  });
});

describe("the person shown at sign-in: the account's name, plus details from the identity card", () => {
  const name = cast.sender.name;
  it("the name is the account holder's (demo cast); date of birth and the masked id come from the identity card", () => {
    const docs: { doc_type: string; fields: Record<string, string> }[] = [
      { doc_type: "degree_certificate", fields: { name: "A. Other" } },
      { doc_type: "id_card", fields: { name: "Asha Rao", dob: "01-02-2003", id_number: "0000 4268 3900", address: "x" } },
    ];
    expect(personRecord(docs)).toEqual({ name, dob: "01-02-2003", idMasked: "XXXX XXXX 3900" });
  });

  it("an empty vault still knows the name, and shows no date of birth or id", () => {
    expect(personRecord([])).toEqual({ name, dob: null, idMasked: null });
  });
});

describe("first-visit language", () => {
  it("Telugu when the browser's first language is Telugu, otherwise English", () => {
    expect(preferredLang("te")).toBe("te");
    expect(preferredLang("te-IN,te;q=0.9,en;q=0.8")).toBe("te");
    expect(preferredLang("TE-in")).toBe("te");
    expect(preferredLang("en-IN,te;q=0.9")).toBe("en");
    expect(preferredLang("hi-IN")).toBe("en");
    expect(preferredLang("tel")).toBe("en");
    expect(preferredLang(null)).toBe("en");
    expect(preferredLang("")).toBe("en");
  });
});
