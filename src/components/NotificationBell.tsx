"use client";
/**
 * NOTIFICATION BELL — tells the owner when someone opens a share for the first time, opens it from a
 * NEW device, tries a killed/expired link, or types a wrong recipient ID/code; and when the issuer
 * changed a record an active share uses. Not on every ordinary view (that would be noise).
 *
 * How it hears about them: it asks GET /api/notifications every 5 seconds (works everywhere), and when a
 * live Supabase database is configured it ALSO listens to Supabase Realtime on access_log, so new
 * attempts appear immediately. New items are announced in the live region.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { showTime } from "@/lib/i18n";
import { get } from "./api";
import { useI18n } from "./I18n";
import { announce } from "./Live";

const POLL_MS = 5000;
const SEEN_KEY = "uv-bell-seen";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LIVE = Boolean(URL_ && KEY && !KEY.startsWith("<") && KEY.length >= 40);

interface Item { id: string; kind: string; at: string; recipientCode: string | null; purpose: string | null; detail: Record<string, unknown> }

export function NotificationBell() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState("");
  useEffect(() => { try { setSeen(localStorage.getItem(SEEN_KEY) ?? ""); } catch { /* storage blocked */ } }, []);
  const known = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    const r = await get<{ notifications: Item[] }>("/api/notifications");
    if (!r.ok) return;
    const list = r.data.notifications;
    if (known.current) {
      const fresh = list.filter((n) => !known.current!.has(n.id));
      if (fresh.length) announce(t("bell.new", { n: fresh.length, first: text(fresh[0]) }));
    }
    known.current = new Set(list.map((n) => n.id));
    setItems(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    let cleanup: (() => void) | undefined;
    if (LIVE) {
      import("@supabase/supabase-js").then(({ createClient }) => {
        const c = createClient(URL_!, KEY!);
        const ch = c.channel("uv-access").on("postgres_changes", { event: "INSERT", schema: "public", table: "access_log" }, () => refresh()).subscribe();
        cleanup = () => { c.removeChannel(ch); };
      }).catch(() => { /* polling still runs */ });
    }
    return () => { clearInterval(id); cleanup?.(); };
  }, [refresh]);

  const text = (n: Item) => n.kind === "issuer_change"
    ? t("notify.issuer_change", { title: String(n.detail.title ?? ""), n: Array.isArray(n.detail.share_ids) ? n.detail.share_ids.length : 0 })
    : t(`notify.${n.kind}`, { code: n.recipientCode ?? "", purpose: n.purpose ?? "" });
  const unseen = items.filter((n) => n.at > seen).length;
  const toggle = () => {
    setOpen(!open);
    if (!open && items[0]) { setSeen(items[0].at); try { localStorage.setItem(SEEN_KEY, items[0].at); } catch { /* ignore */ } }
  };

  return (
    <div className="bell">
      <button type="button" className="bell-btn" aria-expanded={open} aria-controls="bell-panel" onClick={toggle}>
        {t("bell.label")}{unseen ? <span className="bell-count"> {t("bell.count", { n: unseen })}</span> : null}
      </button>
      {open && (
        <div id="bell-panel" className="bell-panel" role="region" aria-label={t("bell.label")}>
          {items.length === 0 ? <p>{t("bell.empty")}</p> : (
            <ul>{items.map((n) => <li key={n.id}><span className="meta">{showTime(n.at)}</span><br />{text(n)}</li>)}</ul>
          )}
          <p className="meta">{LIVE ? t("bell.realtime") : t("bell.polling")}</p>
        </div>
      )}
    </div>
  );
}
