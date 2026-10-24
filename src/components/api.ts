"use client";
/**
 * API helper for the browser — every button that talks to the server goes through post() / get().
 *
 * It also implements the "connectivity loss" fault: when the fault panel switches the browser to
 * "offline" (or the device really is offline), NOTHING is sent and the caller gets a clear,
 * non-alarming answer instead of a hang. Nothing is lost: the person simply tries again later.
 */
export const OFFLINE_KEY = "uv-offline";

export interface ApiResult<T = Record<string, unknown>> { ok: boolean; status: number; data: T; offline?: boolean }

/** Is the browser offline (for real, or because the fault panel says so)? */
export function isOffline(): boolean {
  try { if (sessionStorage.getItem(OFFLINE_KEY) === "1") return true; } catch { /* storage blocked: ignore */ }
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  if (isOffline()) return { ok: false, status: 0, offline: true, data: { error: "offline" } as T };
  try {
    const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const data = (await r.json().catch(() => ({}))) as T;
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, offline: true, data: { error: "network" } as T };
  }
}

export const post = <T = Record<string, unknown>>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });
export const get = <T = Record<string, unknown>>(path: string) => call<T>(path, { cache: "no-store" });
