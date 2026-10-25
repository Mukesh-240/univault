/**
 * PERSON — who the vault belongs to.
 *
 * Plain-English picture:
 *   The NAME is the account holder's name from the demo cast (src/config/demo-cast.json), so it is right even when
 *   the vault is empty. The date of birth and the masked ID number come from the vault's identity card (the
 *   document of type "id_card") once there is one; until then they are simply not shown.
 *   Nothing here looks at any particular person, serial number or the synthetic flag.
 */
import cast from "../config/demo-cast.json";
import { mask } from "./synthetic-aadhaar";
import type { VaultDoc } from "./vault";

export interface PersonRecord { name: string | null; dob: string | null; idMasked: string | null }

export function personRecord(docs: Pick<VaultDoc, "doc_type" | "fields">[]): PersonRecord {
  const card = docs.find((d) => d.doc_type === "id_card") ?? docs.find((d) => d.fields.name);
  const id = card?.fields.id_number;
  return { name: cast.sender.name, dob: card?.fields.dob ?? null, idMasked: id ? mask(id) : null };
}
