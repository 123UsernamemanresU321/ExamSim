-- Structured marking annotations and student-owner marking discussion tickets.
-- Student result visibility remains Edge-mediated; these tables do not grant broad
-- student direct reads.

create table if not exists public.work_annotations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  upload_slot_id uuid null references public.upload_slots(id) on delete set null,
  text_response_id uuid null references public.text_responses(id) on delete set null,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  annotation_kind text not null check (annotation_kind in ('typed_text', 'uploaded_pdf', 'general')),
  visibility text not null default 'student_visible' check (visibility in ('private', 'student_visible')),
  severity text not null default 'note' check (severity in ('note', 'minor', 'major', 'critical')),
  body text not null check (length(trim(body)) > 0),
  anchor_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marking_tickets (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid null references public.question_nodes(id) on delete set null,
  work_annotation_id uuid null references public.work_annotations(id) on delete set null,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  opened_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null check (length(trim(subject)) > 0),
  status text not null default 'open' check (status in ('open', 'owner_review', 'student_reply', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marking_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.marking_tickets(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  author_role text not null check (author_role in ('owner', 'student')),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists work_annotations_attempt_question_idx
  on public.work_annotations(attempt_id, question_node_id, created_at);

create index if not exists marking_tickets_attempt_question_idx
  on public.marking_tickets(attempt_id, question_node_id, status, updated_at desc);

create index if not exists marking_ticket_messages_ticket_idx
  on public.marking_ticket_messages(ticket_id, created_at);

alter table public.work_annotations enable row level security;
alter table public.marking_tickets enable row level security;
alter table public.marking_ticket_messages enable row level security;

drop policy if exists "owner manages work annotations" on public.work_annotations;
create policy "owner manages work annotations" on public.work_annotations
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner manages marking tickets" on public.marking_tickets;
create policy "owner manages marking tickets" on public.marking_tickets
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner manages marking ticket messages" on public.marking_ticket_messages;
create policy "owner manages marking ticket messages" on public.marking_ticket_messages
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop trigger if exists work_annotations_set_updated_at on public.work_annotations;
create trigger work_annotations_set_updated_at
  before update on public.work_annotations
  for each row execute function public.set_updated_at();

drop trigger if exists marking_tickets_set_updated_at on public.marking_tickets;
create trigger marking_tickets_set_updated_at
  before update on public.marking_tickets
  for each row execute function public.set_updated_at();

comment on table public.work_annotations is
  'Owner-created anchored comments on typed responses or uploaded PDFs. Student visibility is controlled by Edge Functions and feedback release.';

comment on table public.marking_tickets is
  'Student-owner discussion tickets for released marking feedback and annotations.';
