/**
 * PERSON — who the vault belongs to, read from the vault's own documents.
 *
 * Plain-English picture:
 *   The greeting ("Namaste, <name>") and the sign-in consent screen show a name, a date of birth and a
 *   masked ID number. They are not typed in anywhere: they are read from the vault's identity card
 *   (the document of type "id_card"). If there is no identity card, the first document that has a
 *   name is used. Nothing here looks at any particular person, serial number or the synthetic flag.
 */
import { mask } from "./synthetic-aadhaar";
import type { VaultDoc } from "./vault";

export interface PersonRecord { name: string | null; dob: string | null; idMasked: string | null }

export function personRecord(docs: Pick<VaultDoc, "doc_type" | "fields">[]): PersonRecord {
  const card = docs.find((d) => d.doc_type === "id_card") ?? docs.find((d) => d.fields.name);
  const id = card?.fields.id_number;
  return { name: card?.fields.name ?? null, dob: card?.fields.dob ?? null, idMasked: id ? mask(id) : null };
}
