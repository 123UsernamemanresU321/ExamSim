-- Examsim product expansion.
-- Adds no-login exam-code sessions, roster-first guest attempts, visual source
-- region metadata, rubric award templates, and live invigilation records.

create extension if not exists pgcrypto;

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'live', 'closed', 'marking', 'returned', 'archived')),
  mode text not null default 'timed' check (mode in ('practice', 'timed', 'controlled', 'seb_required')),
  code_hash text unique null,
  code_display_hint text null,
  code_rotated_at timestamptz null,
  open_at_utc timestamptz not null,
  close_at_utc timestamptz not null,
  start_at_utc timestamptz not null,
  duration_seconds integer not null check (duration_seconds > 0),
  upload_deadline_at_utc timestamptz null,
  display_timezone text not null default 'Africa/Johannesburg',
  attempt_limit_per_student integer not null default 1 check (attempt_limit_per_student > 0),
  identity_policy_json jsonb not null default '{"student_name":true,"student_number":true,"class_group":false,"date":true,"roster_first":true}',
  security_settings_json jsonb not null default '{}',
  settings_json jsonb not null default '{}',
  share_instructions_html text null,
  published_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (close_at_utc > open_at_utc),
  check (upload_deadline_at_utc is null or upload_deadline_at_utc >= start_at_utc)
);

create table if not exists public.student_roster_entries (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_profile_id uuid null references public.profiles(id) on delete set null,
  student_number text not null,
  display_name text not null,
  class_group text null,
  email text null,
  active boolean not null default true,
  accommodations_json jsonb not null default '{}',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, student_number)
);

alter table public.attempts
  alter column assignee_profile_id drop not null,
  add column if not exists exam_session_id uuid null references public.exam_sessions(id) on delete set null,
  add column if not exists roster_entry_id uuid null references public.student_roster_entries(id) on delete set null,
  add column if not exists guest_student_name text null,
  add column if not exists guest_student_number text null,
  add column if not exists guest_class_group text null,
  add column if not exists guest_identity_json jsonb not null default '{}',
  add column if not exists claim_status text not null default 'not_required' check (claim_status in ('not_required', 'unclaimed', 'pending', 'linked', 'rejected')),
  add column if not exists claim_code_hash text null,
  add column if not exists duplicate_identity_flag boolean not null default false,
  add column if not exists identity_review_status text not null default 'not_required' check (identity_review_status in ('not_required', 'needs_review', 'resolved', 'rejected')),
  add column if not exists paused_at timestamptz null,
  add column if not exists forced_submitted_at timestamptz null;

create table if not exists public.attempt_access_tokens (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  exam_session_id uuid null references public.exam_sessions(id) on delete cascade,
  token_hash text unique not null,
  purpose text not null check (purpose in ('guest_attempt', 'claim_attempt', 'resume_attempt')),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  last_used_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  document_kind text not null check (document_kind in ('question_paper', 'markscheme', 'latex_source', 'image_bundle', 'other')),
  source_kind text not null check (source_kind in ('pdf', 'latex', 'json', 'image', 'text', 'mixed')),
  object_path text null,
  original_file_name text null,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'review_required', 'approved', 'failed')),
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_pages (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  width_points numeric null,
  height_points numeric null,
  image_object_path text null,
  text_preview text null,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(source_document_id, page_number)
);

create table if not exists public.question_source_regions (
  id uuid primary key default gen_random_uuid(),
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  question_node_id uuid null references public.question_nodes(id) on delete set null,
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  source_page_id uuid null references public.source_pages(id) on delete set null,
  region_type text not null default 'question' check (region_type in ('question', 'subquestion', 'diagram', 'table', 'answer_area', 'markscheme', 'instructions', 'other')),
  node_key text null,
  bbox_json jsonb not null default '{}',
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'detected' check (status in ('detected', 'approved', 'needs_review', 'ignored')),
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rubric_templates (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  subject text null,
  description text null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, name)
);

create table if not exists public.rubric_template_items (
  id uuid primary key default gen_random_uuid(),
  rubric_template_id uuid not null references public.rubric_templates(id) on delete cascade,
  ordinal integer not null,
  label text not null,
  description text null,
  max_marks numeric not null default 1 check (max_marks >= 0),
  feedback_text text null,
  mark_code text null,
  created_at timestamptz not null default now()
);

create table if not exists public.rubric_item_awards (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  rubric_criteria_id uuid null references public.rubric_criteria(id) on delete set null,
  rubric_template_item_id uuid null references public.rubric_template_items(id) on delete set null,
  marker_profile_id uuid not null references public.profiles(id) on delete cascade,
  awarded_marks numeric not null default 0 check (awarded_marks >= 0),
  selected boolean not null default false,
  feedback_text text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rubric_criteria_id is not null or rubric_template_item_id is not null)
);

create table if not exists public.invigilation_messages (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references public.exam_sessions(id) on delete cascade,
  attempt_id uuid null references public.attempts(id) on delete cascade,
  sender_profile_id uuid null references public.profiles(id) on delete set null,
  sender_kind text not null check (sender_kind in ('owner', 'student_guest', 'student_account', 'system')),
  message_kind text not null check (message_kind in ('private', 'broadcast', 'technical_issue', 'system')),
  body text not null,
  visible_to_student boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.live_interventions (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references public.exam_sessions(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('extra_time', 'pause', 'resume', 'force_submit', 'technical_issue', 'identity_resolved', 'unlock_upload')),
  details_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists exam_sessions_owner_status_idx on public.exam_sessions(owner_profile_id, status, open_at_utc desc);
create index if not exists exam_sessions_code_hash_idx on public.exam_sessions(code_hash) where code_hash is not null;
create index if not exists student_roster_entries_owner_number_idx on public.student_roster_entries(owner_profile_id, student_number);
create index if not exists attempts_exam_session_idx on public.attempts(exam_session_id, created_at desc);
create index if not exists attempts_guest_identity_idx on public.attempts(exam_session_id, guest_student_number) where guest_student_number is not null;
create index if not exists attempt_access_tokens_hash_idx on public.attempt_access_tokens(token_hash);
create index if not exists source_documents_version_idx on public.source_documents(assessment_version_id, document_kind);
create index if not exists question_source_regions_version_idx on public.question_source_regions(assessment_version_id, status);
create index if not exists rubric_templates_owner_subject_idx on public.rubric_templates(owner_profile_id, subject, name);
create index if not exists rubric_item_awards_attempt_question_idx on public.rubric_item_awards(attempt_id, question_node_id);
create index if not exists invigilation_messages_session_created_idx on public.invigilation_messages(exam_session_id, created_at desc);
create index if not exists live_interventions_session_created_idx on public.live_interventions(exam_session_id, created_at desc);

create trigger exam_sessions_set_updated_at before update on public.exam_sessions for each row execute function public.set_updated_at();
create trigger student_roster_entries_set_updated_at before update on public.student_roster_entries for each row execute function public.set_updated_at();
create trigger source_documents_set_updated_at before update on public.source_documents for each row execute function public.set_updated_at();
create trigger question_source_regions_set_updated_at before update on public.question_source_regions for each row execute function public.set_updated_at();
create trigger rubric_templates_set_updated_at before update on public.rubric_templates for each row execute function public.set_updated_at();
create trigger rubric_item_awards_set_updated_at before update on public.rubric_item_awards for each row execute function public.set_updated_at();

alter table public.exam_sessions enable row level security;
alter table public.student_roster_entries enable row level security;
alter table public.attempt_access_tokens enable row level security;
alter table public.source_documents enable row level security;
alter table public.source_pages enable row level security;
alter table public.question_source_regions enable row level security;
alter table public.rubric_templates enable row level security;
alter table public.rubric_template_items enable row level security;
alter table public.rubric_item_awards enable row level security;
alter table public.invigilation_messages enable row level security;
alter table public.live_interventions enable row level security;

create policy "owner manages exam sessions" on public.exam_sessions for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

create policy "owner manages roster entries" on public.student_roster_entries for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

create policy "owner manages source documents" on public.source_documents for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

create policy "owner manages source pages" on public.source_pages for all to authenticated
  using (
    public.is_owner()
    and exists (
      select 1 from public.source_documents sd
      where sd.id = source_pages.source_document_id
        and sd.owner_profile_id = public.current_profile_id()
    )
  )
  with check (
    public.is_owner()
    and exists (
      select 1 from public.source_documents sd
      where sd.id = source_pages.source_document_id
        and sd.owner_profile_id = public.current_profile_id()
    )
  );

create policy "owner manages question source regions" on public.question_source_regions for all to authenticated
  using (
    public.is_owner()
    and exists (
      select 1 from public.assessment_versions av
      join public.assessments a on a.id = av.assessment_id
      where av.id = question_source_regions.assessment_version_id
        and a.owner_profile_id = public.current_profile_id()
    )
  )
  with check (
    public.is_owner()
    and exists (
      select 1 from public.assessment_versions av
      join public.assessments a on a.id = av.assessment_id
      where av.id = question_source_regions.assessment_version_id
        and a.owner_profile_id = public.current_profile_id()
    )
  );

create policy "owner manages rubric templates" on public.rubric_templates for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

create policy "owner manages rubric template items" on public.rubric_template_items for all to authenticated
  using (
    public.is_owner()
    and exists (
      select 1 from public.rubric_templates rt
      where rt.id = rubric_template_items.rubric_template_id
        and rt.owner_profile_id = public.current_profile_id()
    )
  )
  with check (
    public.is_owner()
    and exists (
      select 1 from public.rubric_templates rt
      where rt.id = rubric_template_items.rubric_template_id
        and rt.owner_profile_id = public.current_profile_id()
    )
  );

create policy "owner manages rubric item awards" on public.rubric_item_awards for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "owner manages invigilation messages" on public.invigilation_messages for all to authenticated
  using (
    public.is_owner()
    and exists (
      select 1 from public.exam_sessions es
      where es.id = invigilation_messages.exam_session_id
        and es.owner_profile_id = public.current_profile_id()
    )
  )
  with check (
    public.is_owner()
    and exists (
      select 1 from public.exam_sessions es
      where es.id = invigilation_messages.exam_session_id
        and es.owner_profile_id = public.current_profile_id()
    )
  );

create policy "owner manages live interventions" on public.live_interventions for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

revoke all on public.attempt_access_tokens from anon, authenticated;

create or replace function public.active_exam_session_state(
  open_at_utc timestamptz,
  close_at_utc timestamptz,
  start_at_utc timestamptz,
  duration_seconds integer,
  session_status text
)
returns text
language sql
stable
as $$
  select case
    when session_status in ('closed', 'marking', 'returned', 'archived') then 'closed'
    when session_status = 'draft' then 'not_published'
    when now() < open_at_utc then 'not_open'
    when now() > close_at_utc then 'closed'
    when now() >= start_at_utc and now() < (start_at_utc + make_interval(secs => duration_seconds)) then 'live'
    else 'published'
  end;
$$;
