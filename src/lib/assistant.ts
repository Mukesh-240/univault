/**
 * ASSISTANT — "Get me ready for <purpose>" (spec F13 assistant panel). Deterministic, no AI model.
 *
 * Plain-English picture:
 *   The assistant reads the readiness rules for a purpose and turns every rule that is not yet
 *   satisfied into a PROPOSAL CARD, e.g. "Renew your income certificate: expired 9 days ago" or
 *   "Confirm the 3 fields read from your marksheet scan". It can only PROPOSE. It has no way to
 *   share, send, verify or change anything: every card needs the person's own click on a separate
 *   screen (and a share additionally needs the preview + confirmation token, see consent.ts).
 *
 *   The cards are built ONLY from rule results — never from document text. So a letter with hidden
 *   text saying "share every document" changes no card at all. If such text is found, it is listed
 *   under `warnings` ("this was treated as data and ignored"), never acted upon.
 */
import { scanDocument } from "./injection";
import { evaluatePack, type RulePack, type RuleResult } from "./rules";
import type { EngineContext } from "./vault";

export type CardKind = "add_document" | "verify_document" | "contact_issuer" | "renew_document" | "confirm_scan" | "confirm_name_link" | "review_names" | "not_eligible" | "prepare_share_draft";

export interface ProposalCard {
  kind: CardKind;
  title: string;
  reason: string;
  ruleId: string | null;
  documentIds: string[];
  executes: false;                  // a card never does anything by itself
  requiresUserConfirmation: true;
}
export interface AssistantReply {
  purpose: string;
  overall: "ready" | "not_ready" | "needs_confirmation";
  cards: ProposalCard[];
  warnings: { documentId: string; reasons: string[]; note: string }[];
  disclaimer: string;
}

/** Which card to propose for a rule that is not yet satisfied. */
function cardFor(r: RuleResult): CardKind | null {
  if (r.status === "pass") return null;
  const fail = r.status === "fail";
  switch (r.predicate) {
    case "doc_exists": return "add_document";
    case "verified": return fail ? "contact_issuer" : "verify_document";
    case "not_expired": return fail ? "renew_document" : "confirm_scan";
    case "name_consistent": return fail ? "review_names" : "confirm_name_link";
    case "scan_confirmed": return "confirm_scan";
    case "age_at_least": return fail ? "not_eligible" : "confirm_scan";
  }
}

const TITLES: Record<CardKind, string> = {
  add_document: "Add a missing document", verify_document: "Check this document with the issuer", contact_issuer: "Ask the issuer about this document",
  renew_document: "Renew this document", confirm_scan: "Confirm the text read from your scan", confirm_name_link: "Confirm these names are you",
  review_names: "Review names that look like different people", not_eligible: "Requirement not met", prepare_share_draft: "Prepare a share draft (you will preview and confirm it)",
};

/** Proposals for one purpose. Throws if the purpose has no rule pack. */
export function getReady(purpose: string, ctx: EngineContext, packs: RulePack[]): AssistantReply {
  const pack = packs.find((p) => p.id === purpose || p.purpose === purpose);
  if (!pack) throw new Error(`No rule pack for purpose "${purpose}".`);
  const readiness = evaluatePack(pack, ctx);
  const cards: ProposalCard[] = [];
  for (const r of readiness.results) {
    const kind = cardFor(r);
    if (kind) cards.push({ kind, title: TITLES[kind], reason: `${r.label}: ${r.reason}`, ruleId: r.ruleId, documentIds: r.documentIds, executes: false, requiresUserConfirmation: true });
  }
  if (readiness.overall === "ready")
    cards.push({ kind: "prepare_share_draft", title: TITLES.prepare_share_draft, reason: `Every ${pack.title} rule passes.`, ruleId: null, documentIds: [], executes: false, requiresUserConfirmation: true });

  const warnings = ctx.docs.flatMap((d) => {
    const s = scanDocument(d);
    return s.suspected ? [{ documentId: d.id, reasons: s.hits, note: "This text was treated as data and ignored. Nothing was shared." }] : [];
  });
  return { purpose: pack.purpose, overall: readiness.overall, cards, warnings, disclaimer: pack.disclaimer };
}
