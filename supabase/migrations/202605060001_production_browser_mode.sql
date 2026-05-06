create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists student_13_plus_attested_at timestamptz null,
  add column if not exists student_13_plus_attested_by_profile_id uuid null references public.profiles(id) on delete set null;

alter table public.upload_slots
  add column if not exists file_size_bytes integer null check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 10485760)),
  add column if not exists content_type text null check (content_type is null or content_type = 'application/pdf'),
  add column if not exists confirmed_by_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists locked_at timestamptz null;

create table if not exists public.student_groups (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, name)
);

create table if not exists public.student_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.student_groups(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(group_id, student_profile_id)
);

create table if not exists public.assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  assignment_kind text not null check (assignment_kind in ('individual', 'group')),
  student_profile_id uuid null references public.profiles(id) on delete cascade,
  student_group_id uuid null references public.student_groups(id) on delete cascade,
  start_at_utc timestamptz not null,
  duration_seconds integer not null check (duration_seconds > 0),
  end_at_utc timestamptz not null,
  upload_deadline_at_utc timestamptz null,
  display_timezone text not null default 'Africa/Johannesburg',
  delivery_mode text not null check (delivery_mode in ('browser', 'seb_required')),
  solutions_requested boolean not null default false,
  typed_enabled boolean not null default true,
  per_question_upload_enabled boolean not null default false,
  require_blank_for_skipped boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_at_utc > start_at_utc),
  check (upload_deadline_at_utc is null or upload_deadline_at_utc >= end_at_utc),
  check (
    (assignment_kind = 'individual' and student_profile_id is not null and student_group_id is null)
    or
    (assignment_kind = 'group' and student_group_id is not null and student_profile_id is null)
  )
);

alter table public.attempts
  add column if not exists assessment_assignment_id uuid null references public.assessment_assignments(id) on delete set null;

create table if not exists public.rubrics (
  id uuid primary key default gen_random_uuid(),
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  total_marks numeric not null default 0 check (total_marks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_version_id, title)
);

create table if not exists public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.rubrics(id) on delete cascade,
  question_node_id uuid null references public.question_nodes(id) on delete cascade,
  ordinal integer not null,
  label text not null,
  description text null,
  max_marks numeric not null check (max_marks >= 0),
  created_at timestamptz not null default now(),
  unique(rubric_id, ordinal)
);

create table if not exists public.marks (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid null references public.question_nodes(id) on delete cascade,
  rubric_criteria_id uuid null references public.rubric_criteria(id) on delete cascade,
  marker_profile_id uuid not null references public.profiles(id) on delete cascade,
  awarded_marks numeric not null check (awarded_marks >= 0),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attempt_id, rubric_criteria_id)
);

create table if not exists public.submission_annotations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid null references public.question_nodes(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  annotation_type text not null check (annotation_type in ('note', 'rubric', 'moderation', 'feedback')),
  body text not null,
  anchor_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_releases (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid unique not null references public.attempts(id) on delete cascade,
  released_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  released_at timestamptz not null default now(),
  summary_text text null,
  total_awarded_marks numeric not null default 0 check (total_awarded_marks >= 0),
  total_available_marks numeric not null default 0 check (total_available_marks >= 0),
  visible_to_student boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.parse_jobs (
  id uuid primary key default gen_random_uuid(),
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  source_object_path text not null,
  parser text not null check (parser in ('mineru', 'latex_deterministic', 'json_validator')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'review_required')),
  requested_ocr boolean not null default false,
  error_message text null,
  result_object_path text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parse_job_artifacts (
  id uuid primary key default gen_random_uuid(),
  parse_job_id uuid not null references public.parse_jobs(id) on delete cascade,
  artifact_kind text not null check (artifact_kind in ('markdown', 'json', 'html', 'layout', 'log')),
  object_path text not null,
  content_preview text null,
  created_at timestamptz not null default now(),
  unique(parse_job_id, artifact_kind, object_path)
);

create table if not exists public.owner_audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_auth_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_table text null,
  target_id uuid null,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.retention_requests (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('student', 'assessment', 'attempt', 'upload', 'report')),
  target_id uuid not null,
  status text not null check (status in ('pending', 'completed', 'rejected')),
  notes text null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create trigger student_groups_set_updated_at before update on public.student_groups for each row execute function public.set_updated_at();
create trigger rubrics_set_updated_at before update on public.rubrics for each row execute function public.set_updated_at();
create trigger marks_set_updated_at before update on public.marks for each row execute function public.set_updated_at();
create trigger submission_annotations_set_updated_at before update on public.submission_annotations for each row execute function public.set_updated_at();
create trigger parse_jobs_set_updated_at before update on public.parse_jobs for each row execute function public.set_updated_at();

create or replace function public.current_auth_aal()
returns text
language sql
stable
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1');
$$;

create or replace function public.is_owner_aal2()
returns boolean
language sql
stable
as $$
  select public.is_owner() and public.current_auth_aal() = 'aal2';
$$;

create or replace function public.audit_owner_action(
  action text,
  target_table text default null,
  target_id uuid default null,
  metadata_json jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  audit_id uuid;
begin
  owner_id := public.current_profile_id();
  if owner_id is null or not public.is_owner() then
    raise exception 'Owner audit requires owner role';
  end if;

  insert into public.owner_audit_logs (owner_profile_id, actor_auth_user_id, action, target_table, target_id, metadata_json)
  values (owner_id, (select auth.uid()), action, target_table, target_id, coalesce(metadata_json, '{}'))
  returning id into audit_id;

  return audit_id;
end;
$$;

create index if not exists student_groups_owner_idx on public.student_groups(owner_profile_id);
create index if not exists student_group_members_group_idx on public.student_group_members(group_id);
create index if not exists student_group_members_student_idx on public.student_group_members(student_profile_id);
create index if not exists assessment_assignments_owner_idx on public.assessment_assignments(owner_profile_id);
create index if not exists assessment_assignments_assessment_idx on public.assessment_assignments(assessment_id);
create index if not exists attempts_assignment_idx on public.attempts(assessment_assignment_id);
create index if not exists rubrics_version_idx on public.rubrics(assessment_version_id);
create index if not exists rubric_criteria_rubric_idx on public.rubric_criteria(rubric_id);
create index if not exists marks_attempt_idx on public.marks(attempt_id);
create index if not exists annotations_attempt_idx on public.submission_annotations(attempt_id);
create index if not exists feedback_releases_attempt_idx on public.feedback_releases(attempt_id);
create index if not exists parse_jobs_version_status_idx on public.parse_jobs(assessment_version_id, status);
create index if not exists parse_job_artifacts_job_idx on public.parse_job_artifacts(parse_job_id);
create index if not exists owner_audit_logs_owner_created_idx on public.owner_audit_logs(owner_profile_id, created_at desc);
create index if not exists retention_requests_owner_status_idx on public.retention_requests(owner_profile_id, status);
create unique index if not exists upload_slots_object_path_unique on public.upload_slots(object_path) where object_path is not null;

alter table public.student_groups enable row level security;
alter table public.student_group_members enable row level security;
alter table public.assessment_assignments enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.marks enable row level security;
alter table public.submission_annotations enable row level security;
alter table public.feedback_releases enable row level security;
alter table public.parse_jobs enable row level security;
alter table public.parse_job_artifacts enable row level security;
alter table public.owner_audit_logs enable row level security;
alter table public.retention_requests enable row level security;

create policy "owner manages student groups" on public.student_groups for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "student reads own groups" on public.student_groups for select to authenticated using (
  exists (
    select 1 from public.student_group_members m
    where m.group_id = student_groups.id
      and m.student_profile_id = public.current_profile_id()
  )
);

create policy "owner manages group members" on public.student_group_members for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "student reads own group membership" on public.student_group_members for select to authenticated using (student_profile_id = public.current_profile_id());

create policy "owner manages assignments" on public.assessment_assignments for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "student reads own assignments" on public.assessment_assignments for select to authenticated using (
  student_profile_id = public.current_profile_id()
  or exists (
    select 1 from public.student_group_members m
    where m.group_id = assessment_assignments.student_group_id
      and m.student_profile_id = public.current_profile_id()
  )
);

create policy "owner manages rubrics" on public.rubrics for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner manages rubric criteria" on public.rubric_criteria for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner manages marks" on public.marks for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "student reads released marks" on public.marks for select to authenticated using (
  exists (
    select 1 from public.attempts a
    join public.feedback_releases fr on fr.attempt_id = a.id
    where a.id = marks.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
      and fr.visible_to_student
  )
);

create policy "owner manages annotations" on public.submission_annotations for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "student reads released feedback annotations" on public.submission_annotations for select to authenticated using (
  annotation_type = 'feedback'
  and exists (
    select 1 from public.attempts a
    join public.feedback_releases fr on fr.attempt_id = a.id
    where a.id = submission_annotations.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
      and fr.visible_to_student
  )
);

create policy "owner manages feedback releases" on public.feedback_releases for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "student reads own released feedback" on public.feedback_releases for select to authenticated using (
  visible_to_student
  and exists (
    select 1 from public.attempts a
    where a.id = feedback_releases.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);

create policy "owner manages parse jobs" on public.parse_jobs for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner manages parse artifacts" on public.parse_job_artifacts for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner reads audit logs" on public.owner_audit_logs for select to authenticated using (public.is_owner());
create policy "owner manages retention requests" on public.retention_requests for all to authenticated using (public.is_owner()) with check (public.is_owner());
