/**
 * ACCOUNTS — account types, permanent UV-IDs and issuer authority, all read from JSON (no names in code).
 *
 * Plain-English picture:
 *   - TYPES: Individual (keeps and shares documents, cannot issue), Government, Institution (college/university or
 *     board/school) and Business (these can issue, request and own documents).
 *   - UV-ID: every account has a permanent ID. It identifies an ACCOUNT; it does not prove who is at the keyboard
 *     (that is why the recipient gate needs an ID plus a one-time code).
 *   - AUTHORITY: src/config/issuer-authority.json says which kind of issuer may sign which kind of document. The
 *     issuer category comes from src/config/accounts.json and the signed registry entry, never from text in a PDF.
 *   - Verification of every account is SIMULATED in this prototype, and is labelled as such wherever it is shown.
 * The demo cast (src/config/demo-cast.json: VIT, Government, the student, Google) is read here too, so its issuers
 * have their category. Nothing here looks at a person, a serial number or the synthetic flag.
 */
import accounts from "../config/accounts.json";
import cast from "../config/demo-cast.json";
import authority from "../config/issuer-authority.json";
import { sha256 } from "./crypto";
import type { Role } from "./session";

export type AccountType = "individual" | "government" | "institution" | "business";
export type IssuerCategory = "government" | "college_university" | "board_school" | "business";
export interface AccountInfo { type: AccountType; category?: IssuerCategory; uvId: string }

/** A permanent UV-ID from the account kind and its reference (receivers keep their own recipient code, which is already one). */
export function uvIdFor(role: Role, ref: string): string {
  if (role === "receiver" && /^UV-R-\d+$/.test(ref)) return ref;
  const n = parseInt(sha256(`uv-id|${role}|${ref}`).slice(0, 8), 16) % 10_000;
  return `UV-${role === "issuer" ? "I" : "S"}-${String(n).padStart(4, "0")}`;
}

/** Every known issuer: the demo cast first, then the older synthetic issuers (kept so their signed records still read). */
const ISSUERS: { name: string; type: string; category?: string }[] = [...cast.issuers, ...accounts.issuers];

/** The category an issuer belongs to (null if it is not a known party: then it may issue nothing). */
export function issuerCategory(name: string): IssuerCategory | null {
  const a = ISSUERS.find((i) => i.name === name);
  if (!a) return null;
  return (a.type === "institution" ? a.category : a.type) as IssuerCategory;
}

export function accountInfo(role: Role, ref: string, purpose?: string): AccountInfo {
  if (role === "sender") return { type: accounts.holderType as AccountType, uvId: uvIdFor(role, ref) };
  if (role === "receiver") {
    const own = cast.receivers.find((r) => r.code === ref);
    return { type: ((accounts.receiverTypeByPurpose as Record<string, string>)[own?.purpose ?? purpose ?? ""] ?? "business") as AccountType, uvId: uvIdFor(role, ref) };
  }
  const a = ISSUERS.find((i) => i.name === ref);
  return { type: (a?.type ?? "business") as AccountType, category: issuerCategory(ref) ?? undefined, uvId: uvIdFor(role, ref) };
}

/** May an issuer of this category sign this kind of document? */
const TABLE = authority as unknown as Record<string, string[] | string>;
export const mayIssue = (category: IssuerCategory | null, docType: string): boolean => {
  const allowed = category ? TABLE[category] : undefined;
  return Array.isArray(allowed) && allowed.includes(docType);
};

/** Every document type an issuer may sign. */
export const typesAllowedFor = (name: string): string[] => { const c = issuerCategory(name); const a = c ? TABLE[c] : undefined; return Array.isArray(a) ? [...a] : []; };
