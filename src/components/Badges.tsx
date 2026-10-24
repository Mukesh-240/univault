/**
 * BADGES — the small labels used everywhere. Each one has TEXT as well as a visual style, so meaning
 * never depends on colour alone (accessibility):
 *   TierBadge   issuer-verified = solid, user-uploaded = outlined, user-corrected = dashed (spec §2);
 *   TriBadge    pass / fail / unknown with a symbol (✓ ✗ ?);
 *   StateBadge  a document's verification state.
 */
import type { Tri } from "@/lib/explain";
import type { Tier } from "@/lib/vault";

type T = (key: string) => string;

export function TierBadge({ tier, t }: { tier: Tier; t: T }) {
  return <span className={`badge tier-${tier}`}>{t(`tier.${tier}`)}</span>;
}

const TRI_ICON: Record<Tri, string> = { pass: "✓", fail: "✗", unknown: "?" };
export function TriBadge({ status, t }: { status: Tri; t: T }) {
  return <span className={`badge tri-${status}`}><span aria-hidden="true">{TRI_ICON[status]} </span>{t(`tri.${status}`)}</span>;
}

export function StateBadge({ state, t }: { state: string; t: T }) {
  return <span className={`badge state-${state}`}>{t(`state.${state}`)}</span>;
}
