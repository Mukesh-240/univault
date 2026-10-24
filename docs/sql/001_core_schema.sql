create extension if not exists pgcrypto with schema extensions;
create or replace function public.prevent_mutation() returns trigger language plpgsql as $$
begin raise exception 'Table % is append-only: % is not allowed', tg_table_name, tg_op; end $$;

create table public.documents (
  id uuid primary key default gen_random_uuid(), owner text not null default 'demo',
  doc_type text not null, title text not null, issuer text, serial text, sha256 text not null,
  content jsonb not null, ocr_confidence jsonb,
  source_tier text not null check (source_tier in ('issuer_verified','user_uploaded')),
  language_scripts text[] default '{}', synthetic boolean not null default true, created_at timestamptz not null default now());
create trigger documents_immutable before update or delete on public.documents for each row execute function public.prevent_mutation();

create table public.document_events (
  id bigint generated always as identity primary key, document_id uuid not null references public.documents(id),
  state text not null check (state in ('uploaded','extracted','user_confirmed','verified','unverifiable','tamper_flagged','superseded','revoked')),
  detail jsonb default '{}', created_at timestamptz not null default now());
create trigger document_events_append_only before update or delete on public.document_events for each row execute function public.prevent_mutation();

create table public.assertions (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id),
  field text not null, original_value text, asserted_value text not null, author text not null default 'user',
  evidence text, created_at timestamptz not null default now());
create trigger assertions_append_only before update or delete on public.assertions for each row execute function public.prevent_mutation();

create table public.entity_links (
  id uuid primary key default gen_random_uuid(), doc_a uuid not null references public.documents(id),
  doc_b uuid not null references public.documents(id),
  decision text not null check (decision in ('confirmed_same_person','rejected')),
  score numeric, explanation jsonb, created_at timestamptz not null default now());
create trigger entity_links_append_only before update or delete on public.entity_links for each row execute function public.prevent_mutation();

create table public.issuer_registry (
  id bigint generated always as identity primary key, serial text not null, record_hash text not null,
  status text not null check (status in ('active','superseded','revoked')), superseded_by text,
  issued_at timestamptz not null default now());
create table public.issuer_config (id int primary key default 1 check (id = 1), is_down boolean not null default false, updated_at timestamptz not null default now());
insert into public.issuer_config (id) values (1);

create table public.shares (
  id uuid primary key default gen_random_uuid(), owner text not null default 'demo', recipient text not null,
  purpose text not null, fields jsonb not null, expires_at timestamptz not null, verification_snapshot jsonb,
  created_at timestamptz not null default now());
create trigger shares_immutable before update or delete on public.shares for each row execute function public.prevent_mutation();

create table public.share_events (
  id bigint generated always as identity primary key, share_id uuid not null references public.shares(id),
  state text not null check (state in ('drafted','previewed','confirmed','active','revoked','expired')),
  detail jsonb default '{}', created_at timestamptz not null default now());
create trigger share_events_append_only before update or delete on public.share_events for each row execute function public.prevent_mutation();

create table public.share_tokens (
  id uuid primary key default gen_random_uuid(), share_id uuid not null references public.shares(id),
  recipient_label text not null, token_hash text not null unique, watermark text not null, created_at timestamptz not null default now());
create trigger share_tokens_immutable before update or delete on public.share_tokens for each row execute function public.prevent_mutation();

create table public.token_events (
  id bigint generated always as identity primary key, token_id uuid not null references public.share_tokens(id),
  state text not null check (state in ('issued','active','killed','expired')), reason text, created_at timestamptz not null default now());
create trigger token_events_append_only before update or delete on public.token_events for each row execute function public.prevent_mutation();

create table public.access_log (
  id bigint generated always as identity primary key, token_id uuid references public.share_tokens(id),
  outcome text not null, client_hint text, created_at timestamptz not null default now());
create trigger access_log_append_only before update or delete on public.access_log for each row execute function public.prevent_mutation();

create table public.ledger (
  seq bigint generated always as identity primary key, kind text not null, payload jsonb not null,
  prev_hash text not null, hash text not null, created_at timestamptz not null);
create or replace function public.ledger_chain() returns trigger language plpgsql as $$
declare last_hash text;
begin
  perform pg_advisory_xact_lock(7447001);
  select hash into last_hash from public.ledger order by seq desc limit 1;
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.created_at := clock_timestamp();
  new.hash := encode(extensions.digest(new.prev_hash || '|' || new.kind || '|' || new.payload::text || '|' || new.created_at::text, 'sha256'), 'hex');
  return new;
end $$;
create trigger ledger_chain_trg before insert on public.ledger for each row execute function public.ledger_chain();
create trigger ledger_append_only before update or delete on public.ledger for each row execute function public.prevent_mutation();

create or replace function public.verify_ledger() returns table(ok boolean, total bigint, broken_at bigint)
language plpgsql stable as $$
declare r record; expected_prev text := repeat('0',64); calc text; n bigint := 0;
begin
  for r in select * from public.ledger order by seq loop
    n := n + 1;
    calc := encode(extensions.digest(r.prev_hash || '|' || r.kind || '|' || r.payload::text || '|' || r.created_at::text, 'sha256'), 'hex');
    if r.prev_hash <> expected_prev or r.hash <> calc then return query select false, n, r.seq; return; end if;
    expected_prev := r.hash;
  end loop;
  return query select true, n, null::bigint;
end $$;

do $$ declare t text; begin
  foreach t in array array['documents','document_events','assertions','entity_links','issuer_registry','shares','share_events','share_tokens','token_events','access_log','ledger','issuer_config']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s_read" on public.%I for select to anon using (true)', t, t);
    execute format('create policy "%s_append" on public.%I for insert to anon with check (true)', t, t);
  end loop; end $$;
create policy "issuer_config_toggle" on public.issuer_config for update to anon using (true) with check (true);
grant execute on function public.verify_ledger() to anon;
