-- Exam Vault usability upgrade package.
-- Adds workflow tables for upload checks, markscheme mapping, snippets, incidents,
-- topic/calendar planning, cohorts, receipts, recovery, templates, and queue views.

create extension if not exists pgcrypto;

alter table public.feedback_releases
  add column if not exists release_marks boolean not null default true,
  add column if not exists release_comments boolean not null default true,
  add column if not exists release_annotated_pdfs boolean not null default true,
  add column if not exists release_moderation_summary boolean not null default false,
  add column if not exists release_note text null,
  add column if not exists scheduled_release_at timestamptz null,
  add column if not exists revoked_at timestamptz null,
  add column if not exists superseded_by_release_id uuid null references public.feedback_releases(id) on delete set null;

create table if not exists public.upload_sanity_checks (
  id uuid primary key default gen_random_uuid(),
  upload_slot_id uuid not null references public.upload_slots(id) on delete cascade,
  status text not null check (status in ('accepted', 'accepted_with_warnings', 'needs_review', 'failed')),
  file_name text null,
  file_size_bytes bigint null,
  file_hash text null,
  content_type text null,
  page_count integer null check (page_count is null or page_count >= 0),
  preview_object_path text null,
  warnings_json jsonb not null default '[]',
  checks_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.markscheme_documents (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  source_object_path text not null,
  status text not null check (status in ('uploaded', 'parsed', 'review_required', 'approved')) default 'uploaded',
  created_at timestamptz not null default now()
);

create table if not exists public.markscheme_nodes (
  id uuid primary key default gen_random_uuid(),
  markscheme_document_id uuid not null references public.markscheme_documents(id) on delete cascade,
  node_key text null,
  normalized_key text null,
  ordinal_path integer[] null,
  mapped_question_node_id uuid null references public.question_nodes(id) on delete set null,
  markscheme_html text null,
  source_page_start integer null,
  source_page_end integer null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null check (status in ('mapped', 'unmatched', 'ignored', 'needs_review')) default 'needs_review',
  created_at timestamptz not null default now()
);

create table if not exists public.comment_bank_items (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  comment_text text not null,
  category text null,
  subject text null,
  tags text[] not null default '{}',
  is_student_facing_default boolean not null default true,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attempt_incidents (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  incident_type text not null check (incident_type in ('internet_issue', 'power_cut', 'wrong_upload', 'medical', 'browser_crash', 'admin_note', 'other')),
  description text not null,
  severity text not null check (severity in ('low', 'medium', 'high')) default 'low',
  affects_marking boolean not null default false,
  student_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.attempt_accommodations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  accommodation_type text not null check (accommodation_type in ('extra_time', 'upload_extension', 'manual_reopen_upload', 'ignore_moderation_signal', 'other')),
  extra_seconds integer null check (extra_seconds is null or extra_seconds >= 0),
  reason text not null,
  applied_at timestamptz not null default now()
);

create table if not exists public.topic_tags (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  tag text not null,
  parent_tag_id uuid null references public.topic_tags(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(owner_profile_id, subject, tag)
);

create table if not exists public.question_topic_links (
  id uuid primary key default gen_random_uuid(),
  question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  topic_tag_id uuid not null references public.topic_tags(id) on delete cascade,
  weight numeric not null default 1 check (weight > 0),
  created_at timestamptz not null default now(),
  unique(question_node_id, topic_tag_id)
);

create table if not exists public.calendar_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid null references public.assessments(id) on delete set null,
  paper_code text null,
  topic_tag_id uuid null references public.topic_tags(id) on delete set null,
  reason text not null,
  priority text not null check (priority in ('low', 'medium', 'high')) default 'medium',
  suggested_minutes integer not null default 45 check (suggested_minutes > 0),
  status text not null check (status in ('pending', 'accepted', 'dismissed', 'exported')) default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_templates (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text null,
  assessment_kind text not null check (assessment_kind in ('practice_paper', 'quiz', 'test', 'exam')),
  default_duration_seconds integer not null check (default_duration_seconds > 0),
  default_upload_grace_seconds integer null check (default_upload_grace_seconds is null or default_upload_grace_seconds >= 0),
  delivery_mode text not null default 'browser' check (delivery_mode in ('browser', 'seb_required')),
  solutions_requested boolean not null default true,
  typed_enabled boolean not null default false,
  per_question_upload_enabled boolean not null default true,
  require_blank_for_skipped boolean not null default true,
  default_timezone text not null default 'Africa/Johannesburg',
  policy_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, name)
);

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, name)
);

create table if not exists public.cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(cohort_id, student_profile_id)
);

create table if not exists public.submission_receipts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid unique not null references public.attempts(id) on delete cascade,
  receipt_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.attempt_recovery_actions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('repair_upload_metadata', 'grant_upload_extension', 'owner_replace_upload', 'mark_resolved', 'log_note')),
  upload_slot_id uuid null references public.upload_slots(id) on delete set null,
  details_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace view public.owner_marking_queue
with (security_invoker = true)
as
select
  a.id as attempt_id,
  asm.owner_profile_id,
  asm.id as assessment_id,
  asm.title as assessment_title,
  asm.paper_code,
  p.id as student_profile_id,
  p.display_name as student_name,
  a.created_at as attempt_created_at,
  a.start_at_utc,
  a.end_at_utc,
  a.upload_deadline_at_utc,
  count(distinct us.id) filter (where us.status in ('pending', 'missing')) as missing_upload_slots,
  count(distinct us.id) filter (where us.status = 'uploaded') as uploaded_slots,
  count(distinct us.id) as total_upload_slots,
  count(distinct m.id) as mark_count,
  count(distinct q.id) filter (where q.node_type <> 'section' and not exists (select 1 from public.question_nodes child where child.parent_node_id = q.id)) as markable_leaf_count,
  max(coalesce(fr.visible_to_student, false)::int)::boolean as feedback_released,
  max(case when mr.summary_json is not null then coalesce((mr.summary_json->>'severity'), 'none') else 'none' end) as moderation_severity,
  max(case when ai.id is not null then 1 else 0 end)::boolean as incident_affected,
  greatest(coalesce(max(us.updated_at), a.updated_at), coalesce(max(m.updated_at), a.updated_at), coalesce(max(fr.released_at), a.updated_at)) as last_updated_at
from public.attempts a
join public.assessments asm on asm.id = a.assessment_id
join public.profiles p on p.id = a.assignee_profile_id
left join public.upload_slots us on us.attempt_id = a.id
left join public.question_nodes q on q.assessment_version_id = a.assessment_version_id
left join public.marks m on m.attempt_id = a.id
left join public.feedback_releases fr on fr.attempt_id = a.id and fr.revoked_at is null
left join public.moderation_reports mr on mr.attempt_id = a.id
left join public.attempt_incidents ai on ai.attempt_id = a.id and ai.affects_marking = true
group by a.id, asm.owner_profile_id, asm.id, asm.title, asm.paper_code, p.id, p.display_name;

create index if not exists upload_sanity_checks_slot_created_idx on public.upload_sanity_checks(upload_slot_id, created_at desc);
create index if not exists upload_sanity_checks_hash_idx on public.upload_sanity_checks(file_hash) where file_hash is not null;
create index if not exists markscheme_documents_version_idx on public.markscheme_documents(assessment_version_id, created_at desc);
create index if not exists markscheme_nodes_document_status_idx on public.markscheme_nodes(markscheme_document_id, status);
create index if not exists comment_bank_owner_usage_idx on public.comment_bank_items(owner_profile_id, usage_count desc, updated_at desc);
create index if not exists attempt_incidents_attempt_idx on public.attempt_incidents(attempt_id, created_at desc);
create index if not exists attempt_accommodations_attempt_idx on public.attempt_accommodations(attempt_id, applied_at desc);
create index if not exists topic_tags_owner_subject_idx on public.topic_tags(owner_profile_id, subject, tag);
create index if not exists question_topic_links_question_idx on public.question_topic_links(question_node_id);
create index if not exists calendar_recommendations_owner_status_idx on public.calendar_recommendations(owner_profile_id, status, created_at desc);
create index if not exists assessment_templates_owner_idx on public.assessment_templates(owner_profile_id, name);
create index if not exists cohorts_owner_idx on public.cohorts(owner_profile_id, name);
create index if not exists cohort_members_cohort_idx on public.cohort_members(cohort_id);
create index if not exists submission_receipts_attempt_idx on public.submission_receipts(attempt_id);
create index if not exists attempt_recovery_actions_attempt_idx on public.attempt_recovery_actions(attempt_id, created_at desc);

alter table public.upload_sanity_checks enable row level security;
alter table public.markscheme_documents enable row level security;
alter table public.markscheme_nodes enable row level security;
alter table public.comment_bank_items enable row level security;
alter table public.attempt_incidents enable row level security;
alter table public.attempt_accommodations enable row level security;
alter table public.topic_tags enable row level security;
alter table public.question_topic_links enable row level security;
alter table public.calendar_recommendations enable row level security;
alter table public.assessment_templates enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.submission_receipts enable row level security;
alter table public.attempt_recovery_actions enable row level security;

drop policy if exists "owner manages upload sanity checks" on public.upload_sanity_checks;
create policy "owner manages upload sanity checks" on public.upload_sanity_checks for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "student reads own upload sanity checks" on public.upload_sanity_checks;
create policy "student reads own upload sanity checks" on public.upload_sanity_checks for select to authenticated using (
  exists (
    select 1 from public.upload_slots us
    join public.attempts a on a.id = us.attempt_id
    where us.id = upload_sanity_checks.upload_slot_id and a.assignee_profile_id = public.current_profile_id()
  )
);

drop policy if exists "owner manages markscheme documents" on public.markscheme_documents;
create policy "owner manages markscheme documents" on public.markscheme_documents for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages markscheme nodes" on public.markscheme_nodes;
create policy "owner manages markscheme nodes" on public.markscheme_nodes for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages comment bank" on public.comment_bank_items;
create policy "owner manages comment bank" on public.comment_bank_items for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages incidents" on public.attempt_incidents;
create policy "owner manages incidents" on public.attempt_incidents for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages accommodations" on public.attempt_accommodations;
create policy "owner manages accommodations" on public.attempt_accommodations for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages topic tags" on public.topic_tags;
create policy "owner manages topic tags" on public.topic_tags for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages question topic links" on public.question_topic_links;
create policy "owner manages question topic links" on public.question_topic_links for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages calendar recommendations" on public.calendar_recommendations;
create policy "owner manages calendar recommendations" on public.calendar_recommendations for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages assessment templates" on public.assessment_templates;
create policy "owner manages assessment templates" on public.assessment_templates for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages cohorts" on public.cohorts;
create policy "owner manages cohorts" on public.cohorts for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages cohort members" on public.cohort_members;
create policy "owner manages cohort members" on public.cohort_members for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages submission receipts" on public.submission_receipts;
create policy "owner manages submission receipts" on public.submission_receipts for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "student reads own submission receipts" on public.submission_receipts;
create policy "student reads own submission receipts" on public.submission_receipts for select to authenticated using (
  exists (
    select 1 from public.attempts a
    where a.id = submission_receipts.attempt_id and a.assignee_profile_id = public.current_profile_id()
  )
);
drop policy if exists "owner manages recovery actions" on public.attempt_recovery_actions;
create policy "owner manages recovery actions" on public.attempt_recovery_actions for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

insert into public.assessment_templates (
  owner_profile_id,
  name,
  description,
  assessment_kind,
  default_duration_seconds,
  default_upload_grace_seconds,
  delivery_mode,
  solutions_requested,
  typed_enabled,
  per_question_upload_enabled,
  require_blank_for_skipped,
  policy_json
)
select
  p.id,
  preset.name,
  preset.description,
  preset.assessment_kind,
  preset.default_duration_seconds,
  preset.default_upload_grace_seconds,
  preset.delivery_mode,
  preset.solutions_requested,
  preset.typed_enabled,
  preset.per_question_upload_enabled,
  preset.require_blank_for_skipped,
  preset.policy_json::jsonb
from public.profiles p
cross join (
  values
    ('IB Paper 1 MCQ', 'Multiple-choice timed paper with typed structured answers disabled.', 'exam', 3600, null, 'browser', false, true, false, false, '{"mode":"mcq"}'),
    ('IB Paper 2 handwritten', 'Handwritten root-question PDF upload workflow.', 'exam', 5400, 900, 'browser', true, false, true, true, '{"upload":"root_question"}'),
    ('IB structured test', 'Mixed structured school test.', 'test', 3600, 600, 'browser', true, true, true, true, '{}'),
    ('Olympiad proof paper', 'Long-form proof paper with upload grace.', 'exam', 10800, 1200, 'browser', true, false, true, true, '{"style":"proof"}'),
    ('Quick quiz', 'Short typed quiz.', 'quiz', 900, null, 'browser', false, true, false, false, '{}'),
    ('Untimed practice review', 'Review workflow with generous timing.', 'practice_paper', 86400, 3600, 'browser', true, true, true, false, '{"practice":true}'),
    ('Upload-only homework', 'Owner reviews uploaded work without live sitting pressure.', 'practice_paper', 86400, 86400, 'browser', true, false, true, false, '{"homework":true}')
) as preset(name, description, assessment_kind, default_duration_seconds, default_upload_grace_seconds, delivery_mode, solutions_requested, typed_enabled, per_question_upload_enabled, require_blank_for_skipped, policy_json)
where p.app_role = 'owner'
on conflict (owner_profile_id, name) do nothing;
