/**
 * REGISTRY — moving the simulated issuer's records in and out of the database.
 *
 * Plain-English picture:
 *   The simulated issuer keeps one signed "registry entry" per document version (see issuer.ts).
 *   This file does two small jobs:
 *     1. signEntries(): turn the issuer's plain records into SIGNED entries ready to store.
 *        A record marked signer "rogue" is deliberately signed with a throw-away wrong key, so we
 *        can demonstrate that a forged registry reply is rejected.
 *     2. toRow()/fromRow(): convert between that entry and the database row format.
 *   The registry stores only fingerprints (hashes), never the document's actual values.
 */
import { generateKeyPairSync } from "node:crypto";
import { issueEntry, type Fields, type RegistryEntry } from "./issuer";

/** A plain issuer record before signing (this is the shape the synthetic generator produces). */
export interface IssuerRecord {
  serial: string;
  doc_type: string;
  issuer_name: string;
  fields: Fields;
  status: RegistryEntry["status"];
  superseded_by: string | null;
  version: number;
  signer: "issuer" | "rogue";
}

/** A brand-new random private key, used only to produce deliberately invalid ("forged") signatures. */
const throwawayKey = () =>
  generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

/** Sign every record. Genuine ones with the issuer's private key; "rogue" ones with a throw-away key. */
export function signEntries(records: IssuerRecord[], issuerPrivB64: string): RegistryEntry[] {
  const rogue = throwawayKey();
  return records.map((r) =>
    issueEntry(r.fields, { serial: r.serial, doc_type: r.doc_type, issuer_name: r.issuer_name, status: r.status, superseded_by: r.superseded_by, version: r.version },
      r.signer === "rogue" ? rogue : issuerPrivB64));
}

/** Entry -> database row (column names match docs/sql/001 and 002). */
export const toRow = (e: RegistryEntry) => ({
  serial: e.serial, doc_type: e.doc_type, issuer_name: e.issuer_name, record_hash: e.record_hash, field_hashes: e.field_hashes,
  status: e.status, superseded_by: e.superseded_by ?? null, version: e.version, signature: e.signature,
});

/** Database row -> entry, exactly as the issuer signed it (so the signature can be checked). */
export function fromRow(row: Record<string, unknown>): RegistryEntry {
  return {
    serial: String(row.serial), doc_type: String(row.doc_type), issuer_name: String(row.issuer_name),
    record_hash: String(row.record_hash), field_hashes: (row.field_hashes ?? {}) as Record<string, string>,
    status: row.status as RegistryEntry["status"], superseded_by: (row.superseded_by as string | null) ?? null,
    version: Number(row.version), signature: String(row.signature ?? ""),
  };
}
