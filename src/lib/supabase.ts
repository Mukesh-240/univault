/**
 * SUPABASE — the connection to our database (hosted by Supabase, a managed Postgres service).
 *
 * It uses the PUBLIC "anon" key, which is safe to expose in a browser: the database itself decides
 * what this key may do (read, and append new rows — never edit or delete history). Demo-mode caveat
 * (stated in the threat model): there is no real login in this prototype.
 * The two values come from .env.local, which is never committed to git.
 */
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
