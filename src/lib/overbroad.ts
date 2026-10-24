/**
 * OVER-BROAD REQUESTS — "is this recipient asking for more than its purpose needs?" (spec F10).
 *
 * Plain-English picture:
 *   Each purpose's rule pack (src/rules/*.json) lists the fields that purpose may receive
 *   ("allowed_fields") and smaller alternatives for sensitive ones ("alternatives"), e.g.
 *   "full ID number" -> "last 4 digits", "date of birth" -> "is over 18: yes/no".
 *   A request is flagged when it asks for anything outside the allowed list, or when it claims a
 *   different purpose than the recipient is registered for. We always explain why and propose the
 *   smallest request that would still serve the purpose. Nothing is shared by this check.
 */
import { explain, type Explanation } from "./explain";
import type { RulePack } from "./rules";

export interface RequestInput { recipient_purpose: string; purpose: string; requested: string[] }
export interface RequestCheck {
  flagged: boolean;
  reasons: string[];
  purposeMismatch: boolean;
  extra: string[];                       // requested items beyond what the purpose allows
  alternatives: Record<string, string>;  // extra item -> smaller item that serves the purpose
  minimal: string[];                     // the suggested minimal request
  explanation: Explanation;
}

const packFor = (packs: RulePack[], purpose: string) => packs.find((p) => p.purpose === purpose);
const pretty = (f: string) => f.replace(/_/g, " ").replace(".", ": ");

/** Check one request against the recipient's purpose. */
export function checkRequest(req: RequestInput, packs: RulePack[]): RequestCheck {
  const pack = packFor(packs, req.recipient_purpose);
  const reasons: string[] = [];
  if (!pack) reasons.push(`No rule pack for the purpose "${req.recipient_purpose}", so nothing can be judged necessary.`);
  const purposeMismatch = req.purpose !== req.recipient_purpose;
  if (purposeMismatch) reasons.push(`The request says it is for "${req.purpose}", but this recipient is registered for "${req.recipient_purpose}".`);

  const allowed = new Set(pack?.allowed_fields ?? []);
  const extra = [...new Set(req.requested.filter((f) => !allowed.has(f)))].sort();
  const alternatives: Record<string, string> = {};
  for (const e of extra) if (pack?.alternatives[e]) alternatives[e] = pack.alternatives[e];
  if (extra.length) reasons.push(`Asks for more than "${pack?.title ?? req.recipient_purpose}" needs: ${extra.map(pretty).join(", ")}.` +
    (Object.keys(alternatives).length ? ` Smaller alternative: ${Object.entries(alternatives).map(([k, v]) => `${pretty(k)} -> ${pretty(v)}`).join("; ")}.` : ""));

  const minimal = [...new Set([...req.requested.filter((f) => allowed.has(f)), ...Object.values(alternatives)])].sort();
  const flagged = reasons.length > 0;
  const reason = flagged ? reasons.join(" ") : "Every requested item is needed for this purpose.";
  return {
    flagged, reasons, purposeMismatch, extra, alternatives, minimal,
    explanation: explain({ reason, confidence: { kind: "tri", value: flagged ? "fail" : "pass" }, source: { name: `${pack?.source ?? "no rule pack"} — allowed fields for ${req.recipient_purpose}`, version: pack?.lastReviewed, freshness: "n/a" }, documentIds: [] }),
  };
}
