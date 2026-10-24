/**
 * RESOLUTION — "which of my documents name the same person?" (spec F4, entity resolution).
 *
 * Plain-English picture:
 *   Compares the names on every pair of documents in the vault (including the Telugu-script name
 *   and the person named in a letter), and lists the pairs best match first, each with its score,
 *   a verdict (likely the same / possibly / unlikely) and plain-language reasons.
 *
 *   It NEVER links anything by itself (autoMerge is always false). A link exists only after the
 *   person clicks Confirm (or Reject); that decision is stored separately (entity_links table).
 */
import { explain, type Explanation } from "./explain";
import { matchNames, type NameMatch } from "./names";
import type { EntityLink, VaultDoc } from "./vault";

/** Fields that hold a person's name. */
export const NAME_FIELDS = ["name", "name_te", "subject_name"];

export interface CandidatePair {
  a: string; b: string;             // document ids
  fieldA: string; fieldB: string;   // which name fields were compared
  score: number;
  verdict: NameMatch["verdict"];
  explanations: string[];
  autoMerge: false;
  decision?: EntityLink["decision"]; // the person's decision, if they made one
  explanation: Explanation;
}

/** All document pairs, best match first. For each pair, the best-matching pair of name fields is used. */
export function candidatePairs(docs: VaultDoc[], links: EntityLink[] = []): CandidatePair[] {
  const out: CandidatePair[] = [];
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const [x, y] = [docs[i], docs[j]];
    let top: { fa: string; fb: string; m: NameMatch } | null = null;
    for (const fa of NAME_FIELDS) for (const fb of NAME_FIELDS) {
      if (!x.fields[fa] || !y.fields[fb]) continue;
      const m = matchNames(x.fields[fa], y.fields[fb]);
      if (!top || m.score > top.m.score) top = { fa, fb, m };
    }
    if (!top) continue;
    const link = links.find((l) => (l.a === x.id && l.b === y.id) || (l.a === y.id && l.b === x.id));
    out.push({
      a: x.id, b: y.id, fieldA: top.fa, fieldB: top.fb, score: top.m.score, verdict: top.m.verdict, explanations: top.m.explanations,
      autoMerge: false, decision: link?.decision,
      explanation: explain({
        reason: top.m.explanations.join("; "), confidence: { kind: "score", value: top.m.score },
        source: { name: "UNIVAULT name matcher (rules: initials, honorifics, word order, Telugu transliteration)", freshness: "n/a" },
        documentIds: [x.id, y.id],
      }),
    });
  }
  // Best first; ties broken by document ids so the order is always the same.
  return out.sort((p, q) => q.score - p.score || `${p.a}${p.b}`.localeCompare(`${q.a}${q.b}`));
}
