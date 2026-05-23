-- Exam Vault student-side usability package.
-- Adds student command-center, readiness, notification, accessibility, upload queue,
-- incident, feedback inbox, archive/progress, and confidence tracking data.

create extension if not exists pgcrypto;

create table if not exists public.student_device_checks (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid null references public.attempts(id) on delete cascade,
  device_id_hash text null,
  user_agent_hash text null,
  checks_json jsonb not null default '{}',
  status text not null check (status in ('passed', 'warning', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.student_devices (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id_hash text not null,
  display_name text null,
  user_agent_hash text null,
  browser_label text null,
  last_check_status text null check (last_check_status is null or last_check_status in ('passed', 'warning', 'failed')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(student_profile_id, device_id_hash)
);

create table if not exists public.student_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid unique not null references public.profiles(id) on delete cascade,
  exam_24h boolean not null default true,
  exam_1h boolean not null default true,
  exam_10m boolean not null default true,
  upload_deadline_10m boolean not null default true,
  feedback_released boolean not null default true,
  correction_reviewed boolean not null default true,
  browser_notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_notifications (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link_url text null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_materials (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  title text not null,
  material_type text not null check (material_type in ('formula_booklet', 'data_booklet', 'annex', 'instructions', 'reference', 'other')),
  object_path text null,
  content_html text null,
  visibility_policy text not null check (visibility_policy in ('before_exam', 'active_only', 'after_finish', 'always', 'owner_only')),
  created_at timestamptz not null default now()
);

create table if not exists public.student_accessibility_preferences (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid unique not null references public.profiles(id) on delete cascade,
  preferences_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_performance_preferences (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid unique not null references public.profiles(id) on delete cascade,
  low_bandwidth_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.upload_queue_events (
  id uuid primary key default gen_random_uuid(),
  upload_slot_id uuid not null references public.upload_slots(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  payload_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.student_incident_reports (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  incident_type text not null check (incident_type in ('internet_issue', 'power_cut', 'browser_crash', 'upload_problem', 'wrong_file_uploaded', 'scanner_camera_issue', 'medical_issue', 'other')),
  description text not null,
  affected_question_node_id uuid null references public.question_nodes(id) on delete set null,
  payload_json jsonb not null default '{}',
  status text not null check (status in ('submitted', 'reviewed', 'resolved', 'rejected')) default 'submitted',
  created_at timestamptz not null default now()
);

create table if not exists public.student_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.student_feedback_reads (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  feedback_release_id uuid null references public.feedback_releases(id) on delete cascade,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(student_profile_id, attempt_id, feedback_release_id)
);

create table if not exists public.student_confidence_ratings (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  topic_tag_id uuid null references public.topic_tags(id) on delete set null,
  confidence integer not null check (confidence >= 1 and confidence <= 5),
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_profile_id, attempt_id, question_node_id)
);

create index if not exists student_device_checks_student_created_idx on public.student_device_checks(student_profile_id, created_at desc);
create index if not exists student_devices_student_seen_idx on public.student_devices(student_profile_id, last_seen_at desc);
create index if not exists student_notifications_student_read_idx on public.student_notifications(student_profile_id, read_at, created_at desc);
create index if not exists assessment_materials_attempt_lookup_idx on public.assessment_materials(assessment_id, assessment_version_id, visibility_policy);
create index if not exists upload_queue_events_slot_created_idx on public.upload_queue_events(upload_slot_id, created_at desc);
create index if not exists student_incident_reports_attempt_idx on public.student_incident_reports(attempt_id, created_at desc);
create index if not exists student_feedback_reads_student_idx on public.student_feedback_reads(student_profile_id, read_at, created_at desc);
create index if not exists student_confidence_ratings_attempt_idx on public.student_confidence_ratings(attempt_id, question_node_id);

alter table public.student_device_checks enable row level security;
alter table public.student_devices enable row level security;
alter table public.student_notification_preferences enable row level security;
alter table public.student_notifications enable row level security;
alter table public.assessment_materials enable row level security;
alter table public.student_accessibility_preferences enable row level security;
alter table public.student_performance_preferences enable row level security;
alter table public.upload_queue_events enable row level security;
alter table public.student_incident_reports enable row level security;
alter table public.student_recovery_codes enable row level security;
alter table public.student_feedback_reads enable row level security;
alter table public.student_confidence_ratings enable row level security;

drop policy if exists "students read released mistake categories" on public.mistake_categories;
create policy "students read released mistake categories" on public.mistake_categories for select to authenticated using (
  exists (
    select 1
    from public.mistake_instances mi
    join public.attempts a on a.id = mi.attempt_id
    join public.feedback_releases fr on fr.attempt_id = a.id
    where mi.category_id = mistake_categories.id
      and mi.student_visible = true
      and a.assignee_profile_id = public.current_profile_id()
      and fr.visible_to_student = true
      and fr.revoked_at is null
  )
);

drop policy if exists "students manage own device checks" on public.student_device_checks;
create policy "students manage own device checks" on public.student_device_checks for all to authenticated
  using (student_profile_id = public.current_profile_id())
  with check (student_profile_id = public.current_profile_id());
drop policy if exists "owner reads student device checks" on public.student_device_checks;
create policy "owner reads student device checks" on public.student_device_checks for select to authenticated using (public.is_owner());

drop policy if exists "students manage own devices" on public.student_devices;
create policy "students manage own devices" on public.student_devices for all to authenticated
  using (student_profile_id = public.current_profile_id())
  with check (student_profile_id = public.current_profile_id());
drop policy if exists "owner reads student devices" on public.student_devices;
create policy "owner reads student devices" on public.student_devices for select to authenticated using (public.is_owner());

drop policy if exists "students manage own notification prefs" on public.student_notification_preferences;
create policy "students manage own notification prefs" on public.student_notification_preferences for all to authenticated
  using (student_profile_id = public.current_profile_id())
  with check (student_profile_id = public.current_profile_id());
drop policy if exists "students manage own notifications" on public.student_notifications;
create policy "students manage own notifications" on public.student_notifications for all to authenticated
  using (student_profile_id = public.current_profile_id())
  with check (student_profile_id = public.current_profile_id());

drop policy if exists "owner manages assessment materials" on public.assessment_materials;
create policy "owner manages assessment materials" on public.assessment_materials for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "students read allowed assessment materials" on public.assessment_materials;
create policy "students read allowed assessment materials" on public.assessment_materials for select to authenticated using (
  visibility_policy <> 'owner_only'
  and exists (
    select 1 from public.attempts a
    where a.assessment_id = assessment_materials.assessment_id
      and a.assessment_version_id = assessment_materials.assessment_version_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);

drop policy if exists "students manage own accessibility prefs" on public.student_accessibility_preferences;
create policy "students manage own accessibility prefs" on public.student_accessibility_preferences for all to authenticated
  using (student_profile_id = public.current_profile_id())
  with check (student_profile_id = public.current_profile_id());
drop policy if exists "students manage own performance prefs" on public.student_performance_preferences;
create policy "students manage own performance prefs" on public.student_performance_preferences for all to authenticated
  using (student_profile_id = public.current_profile_id())
  with check (student_profile_id = public.current_profile_id());

drop policy if exists "students insert own upload queue events" on public.upload_queue_events;
create policy "students insert own upload queue events" on public.upload_queue_events for insert to authenticated with check (
  student_profile_id = public.current_profile_id()
  and exists (
    select 1 from public.upload_slots us
    join public.attempts a on a.id = us.attempt_id
    where us.id = upload_queue_events.upload_slot_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);
drop policy if exists "students read own upload queue events" on public.upload_queue_events;
create policy "students read own upload queue events" on public.upload_queue_events for select to authenticated using (
  student_profile_id = public.current_profile_id()
  and exists (
    select 1 from public.upload_slots us
    join public.attempts a on a.id = us.attempt_id
    where us.id = upload_queue_events.upload_slot_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);
drop policy if exists "owner reads upload queue events" on public.upload_queue_events;
create policy "owner reads upload queue events" on public.upload_queue_events for select to authenticated using (public.is_owner());

drop policy if exists "students manage own incident reports" on public.student_incident_reports;
create policy "students manage own incident reports" on public.student_incident_reports for all to authenticated
  using (
    student_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.attempts a
      where a.id = student_incident_reports.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
    )
  )
  with check (
    student_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.attempts a
      where a.id = student_incident_reports.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
    )
  );
drop policy if exists "owner manages student incident reports" on public.student_incident_reports;
create policy "owner manages student incident reports" on public.student_incident_reports for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "students manage own recovery codes" on public.student_recovery_codes;
create policy "students manage own recovery codes" on public.student_recovery_codes for all to authenticated
  using (student_profile_id = public.current_profile_id())
  with check (student_profile_id = public.current_profile_id());

drop policy if exists "students manage own feedback reads" on public.student_feedback_reads;
create policy "students manage own feedback reads" on public.student_feedback_reads for all to authenticated
  using (
    student_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.attempts a
      join public.feedback_releases fr on fr.attempt_id = a.id
      where a.id = student_feedback_reads.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
        and fr.visible_to_student = true
        and fr.revoked_at is null
        and (student_feedback_reads.feedback_release_id is null or fr.id = student_feedback_reads.feedback_release_id)
    )
  )
  with check (
    student_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.attempts a
      join public.feedback_releases fr on fr.attempt_id = a.id
      where a.id = student_feedback_reads.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
        and fr.visible_to_student = true
        and fr.revoked_at is null
        and (student_feedback_reads.feedback_release_id is null or fr.id = student_feedback_reads.feedback_release_id)
    )
  );

drop policy if exists "students manage own confidence ratings" on public.student_confidence_ratings;
create policy "students manage own confidence ratings" on public.student_confidence_ratings for all to authenticated
  using (
    student_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.attempts a
      join public.feedback_releases fr on fr.attempt_id = a.id
      where a.id = student_confidence_ratings.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
        and fr.visible_to_student = true
        and fr.revoked_at is null
    )
  )
  with check (
    student_profile_id = public.current_profile_id()
    and exists (
      select 1 from public.attempts a
      join public.feedback_releases fr on fr.attempt_id = a.id
      where a.id = student_confidence_ratings.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
        and fr.visible_to_student = true
        and fr.revoked_at is null
    )
  );
