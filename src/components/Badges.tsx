/**
 * BADGES — the small labels used everywhere. Each one has an ICON and WORDS as well as a colour, so
 * meaning never depends on colour alone (accessibility):
 *   TierBadge   issuer-verified = solid, user-uploaded = outlined, user-corrected = dashed (spec §2);
 *   TriBadge    a rule's answer: Done (green) / Needs you (amber) / Cannot tell (grey);
 *   StateBadge  a document's verification state, in the four everyday words (see StatusChip.tsx).
 */
import type { Tri } from "@/lib/explain";
import type { Tier } from "@/lib/vault";
import { Chip, docStatus, StatusChip, type Kind } from "./StatusChip";

type T = (key: string) => string;

export function TierBadge({ tier, t }: { tier: Tier; t: T }) {
  return <span className={`badge tier-${tier}`}>{t(`tier.${tier}`)}</span>;
}

const TRI_KIND: Record<Tri, Kind> = { pass: "ok", fail: "warn", unknown: "unk" };
export function TriBadge({ status, t }: { status: Tri; t: T }) {
  return <Chip kind={TRI_KIND[status]}>{t(`tri.${status}`)}</Chip>;
}

export function StateBadge({ state, t, freshness }: { state: string; t: T; freshness?: string }) {
  return <StatusChip status={docStatus(state, freshness)} t={t} />;
}
