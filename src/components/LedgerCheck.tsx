"use client";
/**
 * LEDGER CHECK — the "Verify ledger" button. Asks the server to recompute the whole hash chain
 * (GET /api/ledger -> verify_ledger()) and announces the answer.
 */
import { useState } from "react";
import { get } from "./api";
import { useI18n } from "./I18n";
import { announce } from "./Live";

export function LedgerCheck() {
  const { t } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  const check = async () => {
    const r = await get<{ ok: boolean; total: number; broken_at: number | null }>("/api/ledger");
    const m = r.offline ? t("api.offline") : !r.ok ? t("api.failed")
      : r.data.ok ? t("ledger.ok", { n: r.data.total }) : t("ledger.broken", { line: String(r.data.broken_at) });
    setMsg(m);
    announce(m);
  };
  return (
    <div className="row">
      <button type="button" onClick={check}>{t("ledger.verify")}</button>
      {msg && <span>{msg}</span>}
    </div>
  );
}
