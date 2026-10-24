/**
 * STATUS CHIP — one small label that is ALWAYS an icon + a word + a colour (never colour alone).
 *
 * Plain-English picture: a document is in one of four situations, and the person sees the same four
 * words everywhere: Verified (green tick), Needs your attention (amber triangle), Not accepted (red cross),
 * Not checked yet (grey clock). docStatus() turns the engine's technical verification state into one of
 * those four; it only re-labels, it never decides anything (the engines already decided).
 *   verified (fresh)                 -> Verified
 *   verified but older than 24 hours -> Needs your attention (check it again)
 *   replaced by the issuer           -> Needs your attention
 *   doesn't match / revoked          -> Not accepted
 *   issuer unreachable / not checked / no serial number -> Not checked yet
 * Works in server and client components (no hooks).
 */
import { CircleCheck, CircleX, Clock, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { docStatus, type Status } from "@/lib/ui-logic";

export type Kind = "ok" | "warn" | "bad" | "unk";
export { docStatus, type Status };

const ICON = { ok: CircleCheck, warn: TriangleAlert, bad: CircleX, unk: Clock } as const;
const KIND_OF: Record<Status, Kind> = { verified: "ok", attention: "warn", rejected: "bad", unchecked: "unk" };

/** A chip with any words. Use StatusChip for the four document statuses. */
export function Chip({ kind, children }: { kind: Kind; children: ReactNode }) {
  const Icon = ICON[kind];
  return <span className={`chip ${kind}`}><Icon size={20} aria-hidden="true" />{children}</span>;
}

export function StatusChip({ status, t }: { status: Status; t: (key: string) => string }) {
  return <Chip kind={KIND_OF[status]}>{t(`status.${status}`)}</Chip>;
}

export { KIND_OF };
