-- 004_lock_anon.sql — take the database away from the PUBLIC anon key. RUN THIS ONLY AFTER:
--   1. SUPABASE_SERVICE_ROLE_KEY is in .env.local AND in Vercel (Production + Preview), and
--   2. the app has been redeployed (it then talks to the database with the service key, which ignores these policies).
-- If you run it before step 1 and 2 the app stops working (it would be using the anon key you just locked out).
-- What it does: removes every policy that lets the anon role read, add or erase rows. With row-level security on and no
-- policy, anon can do nothing; the service role (server only) still can. The append-only triggers stay as they are.
do $$ declare t text; begin
  foreach t in array array['documents','document_events','assertions','entity_links','issuer_registry','shares','share_events','share_tokens','token_events','access_log','ledger','issuer_config','document_payloads','recipients']
  loop
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_append" on public.%I', t, t);
  end loop;
end $$;
drop policy if exists "payload_read" on public.document_payloads;
drop policy if exists "payload_insert" on public.document_payloads;
drop policy if exists "payload_erase" on public.document_payloads;
drop policy if exists "recipients_read" on public.recipients;
drop policy if exists "recipients_insert" on public.recipients;
drop policy if exists "issuer_config_toggle" on public.issuer_config;
revoke execute on function public.verify_ledger() from anon;
-- Check afterwards: with the anon key, `npx tsx scripts/anon-probe.ts` must print DENIED or rows=0 for every table.
