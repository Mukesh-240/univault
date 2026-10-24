/**
 * EXPLAIN — the one shape every automated result must have (master rule 5, spec F23).
 *
 * Plain-English picture:
 *   Whenever UNIVAULT decides something automatically (a readiness line, a name match, an OCR field,
 *   a verification result, an injection warning, an over-broad request warning), it must tell the
 *   person four things and offer two buttons:
 *     1. REASON      — why, in plain words;
 *     2. CONFIDENCE  — how sure: a score (0..1), pass/fail/unknown, or strength of evidence;
 *     3. SOURCE      — what it was based on (which rule pack / issuer registry version / document);
 *     4. FRESHNESS   — when that source was checked (and whether it is now stale);
 *     + "Correct / Override" and "Escalate / Dispute" — both recorded as append-only ledger lines.
 *   The screen component <Explain> (Phase 3) renders exactly this shape; engines must fill it in.
 */

export type Tri = "pass" | "fail" | "unknown";

/** How sure the system is, in one of three forms. */
export type Confidence =
  | { kind: "score"; value: number }                              // e.g. name match 0.87
  | { kind: "tri"; value: Tri }                                   // a rule outcome
  | { kind: "evidence"; value: "strong" | "weaker" | "none" };    // verification by file hash = strong, by scanned fields = weaker

/** Where the result came from and how fresh that is. */
export interface Source {
  name: string;                         // e.g. "UNIVAULT demo rule pack v1", "SIMULATED ISSUER registry"
  version?: string | number;            // e.g. registry version 2
  checkedAt?: string;                   // ISO timestamp of the check
  freshness?: "fresh" | "stale" | "n/a";
}

/** The two human actions every automated result offers. */
export const ACTIONS = ["override", "dispute"] as const;
export type Action = (typeof ACTIONS)[number];

export interface Explanation {
  reason: string;
  confidence: Confidence;
  source: Source;
  documentIds: string[];
  actions: readonly Action[];
}

/** Build an explanation; the two actions are always attached, so no result can forget them. */
export const explain = (e: Omit<Explanation, "actions">): Explanation => ({ ...e, actions: ACTIONS });
