alter table public.issuer_registry add column if not exists field_hashes jsonb, add column if not exists signature text,
  add column if not exists doc_type text, add column if not exists issuer_name text, add column if not exists version int not null default 1;
create unique index if not exists issuer_registry_serial_version on public.issuer_registry(serial, version);

alter table public.documents drop column if exists content;
alter table public.documents drop column if exists ocr_confidence;
create table public.document_payloads (
  document_id uuid primary key references public.documents(id), content jsonb not null, ocr_confidence jsonb, created_at timestamptz not null default now());
alter table public.document_payloads enable row level security;
create policy "payload_read" on public.document_payloads for select to anon using (true);
create policy "payload_insert" on public.document_payloads for insert to anon with check (true);
create policy "payload_erase" on public.document_payloads for delete to anon using (true);

alter table public.document_events drop constraint document_events_state_check;
alter table public.document_events add constraint document_events_state_check
  check (state in ('uploaded','extracted','user_confirmed','verified','unverifiable','tamper_flagged','superseded','revoked','erased'));

create table public.recipients (
  id uuid primary key default gen_random_uuid(), recipient_code text not null unique, name text not null, org text, created_at timestamptz not null default now());
alter table public.recipients enable row level security;
create policy "recipients_read" on public.recipients for select to anon using (true);
create policy "recipients_insert" on public.recipients for insert to anon with check (true);
create trigger recipients_immutable before update or delete on public.recipients for each row execute function public.prevent_mutation();

alter table public.shares add column if not exists policy jsonb not null default '{}';
alter table public.share_tokens add column if not exists recipient_code text, add column if not exists otp_hash text;
alter table public.access_log add column if not exists detail jsonb default '{}';
alter publication supabase_realtime add table public.access_log;
