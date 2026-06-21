-- Per-attempt delivery evidence for student-visible invigilation messages.

create table if not exists public.invigilation_message_receipts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.invigilation_messages(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (message_id, attempt_id)
);

create index if not exists invigilation_message_receipts_attempt_idx
  on public.invigilation_message_receipts(attempt_id, acknowledged_at desc);

alter table public.invigilation_message_receipts enable row level security;

revoke all on table public.invigilation_message_receipts from public, anon;
grant select on table public.invigilation_message_receipts to authenticated;
grant select, insert, update, delete on table public.invigilation_message_receipts to service_role;

drop policy if exists institution_invigilation_receipt_read on public.invigilation_message_receipts;
create policy institution_invigilation_receipt_read
  on public.invigilation_message_receipts
  for select
  to authenticated
  using (
    public.has_institution_permission(
      public.owner_profile_id_for_attempt(attempt_id),
      'invigilation'
    )
  );

comment on table public.invigilation_message_receipts is
  'Idempotent student acknowledgement evidence. Students write only through verified Edge functions.';
