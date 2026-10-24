/**
 * DATABASE SETTINGS CHECK — "is a real database configured, and if not, may the offline demo store be used?"
 * Kept in its own small file (no server-only imports) so the middleware can ask the same question
 * before any route runs. src/lib/supabase.ts uses these same answers to pick the database client.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when there is no usable database key, so the offline demo store would be needed. */
export const OFFLINE = !SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY.startsWith("<") || SUPABASE_KEY.length < 40;

/** Offline store allowed? Always in development; in production only with the explicit test opt-in. */
export const ALLOW_OFFLINE = process.env.NODE_ENV !== "production" || process.env.UNIVAULT_OFFLINE_DEMO === "1";

/** False = production without a database key: pages show "Database not configured", APIs refuse. */
export const DB_CONFIGURED = !OFFLINE || ALLOW_OFFLINE;
