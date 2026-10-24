/**
 * DOC ICON — a small picture for each kind of document, so a person can tell cards apart at a glance.
 * Always decorative (aria-hidden): the document's title is written next to it.
 */
import { Award, FileText, GraduationCap, IdCard, Landmark, Mail, ScrollText, School } from "lucide-react";

const ICONS = {
  id_card: IdCard, degree_certificate: GraduationCap, marksheet: ScrollText, income_certificate: Landmark,
  provisional_certificate: Award, reference_letter: Mail, school_certificate: School, transfer_certificate: School,
} as const;

export function DocIcon({ type, size = 32 }: { type: string; size?: number }) {
  const Icon = (ICONS as Record<string, typeof FileText>)[type] ?? FileText;
  return <Icon size={size} aria-hidden="true" />;
}
