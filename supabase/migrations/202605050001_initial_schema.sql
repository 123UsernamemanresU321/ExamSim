create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  app_role text not null check (app_role in ('owner', 'student')),
  display_name text not null,
  owner_profile_id uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owner_settings (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid unique not null references public.profiles(id) on delete cascade,
  owner_email text not null,
  default_timezone text not null default 'Africa/Johannesburg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owner_student_links (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  link_type text not null check (link_type in ('owner_persona', 'managed_student')),
  created_at timestamptz not null default now(),
  unique(owner_profile_id, student_profile_id, link_type)
);

create table public.student_credentials (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid unique not null references public.profiles(id) on delete cascade,
  login_code text unique not null,
  activation_code_hash text not null,
  activated_at timestamptz null,
  created_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  paper_code text null,
  external_schedule_ref text null,
  assessment_kind text not null check (assessment_kind in ('practice_paper', 'quiz', 'test', 'exam')),
  description text null,
  default_timezone text not null default 'Africa/Johannesburg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assessment_versions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  version_no integer not null,
  status text not null check (status in ('draft', 'review_required', 'published', 'archived')),
  source_kind text not null check (source_kind in ('pdf', 'latex', 'json')),
  source_object_path text null,
  normalized_package_path text null,
  normalized_package_json jsonb null,
  parse_confidence numeric null check (parse_confidence is null or (parse_confidence >= 0 and parse_confidence <= 1)),
  requires_owner_review boolean not null default true,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(assessment_id, version_no)
);

create table public.question_nodes (
  id uuid primary key default gen_random_uuid(),
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  parent_node_id uuid null references public.question_nodes(id) on delete cascade,
  node_key text not null,
  ordinal integer not null,
  node_type text not null check (node_type in ('section', 'question', 'subquestion', 'part')),
  title text null,
  prompt_html text null,
  prompt_latex text null,
  marks numeric null check (marks is null or marks >= 0),
  response_mode text not null check (response_mode in ('none', 'typed_text', 'upload_pdf', 'typed_or_upload', 'multiple_choice', 'numerical')),
  interaction_json jsonb null,
  source_page_start integer null,
  source_page_end integer null,
  created_at timestamptz not null default now(),
  unique(assessment_version_id, node_key)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id),
  assignee_profile_id uuid not null references public.profiles(id) on delete cascade,
  start_at_utc timestamptz not null,
  duration_seconds integer not null check(duration_seconds > 0),
  end_at_utc timestamptz not null,
  upload_deadline_at_utc timestamptz null,
  display_timezone text not null default 'Africa/Johannesburg',
  delivery_mode text not null check (delivery_mode in ('browser', 'seb_required')),
  solutions_requested boolean not null default false,
  typed_enabled boolean not null default true,
  per_question_upload_enabled boolean not null default false,
  require_blank_for_skipped boolean not null default false,
  state_cache text null check (state_cache is null or state_cache in ('WAITING', 'ACTIVE', 'UPLOAD_ONLY', 'FINISHED_REVIEW')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at_utc > start_at_utc),
  check (upload_deadline_at_utc is null or upload_deadline_at_utc >= end_at_utc)
);

create table public.attempt_sessions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz null,
  ended_at timestamptz null,
  device_id_hash text null,
  user_agent_hash text null,
  ip_hash text null,
  seb_verified boolean not null default false,
  browser_exam_key_hash text null,
  config_key_hash text null,
  created_at timestamptz not null default now()
);

create table public.attempt_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  attempt_session_id uuid null references public.attempt_sessions(id) on delete set null,
  event_type text not null,
  client_event_at timestamptz null,
  server_received_at timestamptz not null default now(),
  client_seq integer null,
  payload_json jsonb not null default '{}',
  state_token_id text null,
  created_at timestamptz not null default now()
);

create table public.text_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id),
  answer_text text not null default '',
  saved_at timestamptz not null default now(),
  finalized_at timestamptz null,
  unique(attempt_id, question_node_id)
);

create table public.upload_slots (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id),
  required boolean not null default false,
  object_path text null,
  uploaded_at timestamptz null,
  is_blank_placeholder boolean not null default false,
  status text not null check (status in ('pending', 'uploaded', 'blank_placeholder', 'missing', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attempt_id, question_node_id)
);

create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid unique not null references public.attempts(id) on delete cascade,
  summary_json jsonb not null,
  generated_at timestamptz not null default now()
);

create table public.assessment_schedule (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references public.assessments(id) on delete cascade,
  paper_code text,
  external_schedule_ref text,
  start_at_utc timestamptz,
  timezone text default 'Africa/Johannesburg',
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger owner_settings_set_updated_at before update on public.owner_settings for each row execute function public.set_updated_at();
create trigger assessments_set_updated_at before update on public.assessments for each row execute function public.set_updated_at();
create trigger attempts_set_updated_at before update on public.attempts for each row execute function public.set_updated_at();
create trigger upload_slots_set_updated_at before update on public.upload_slots for each row execute function public.set_updated_at();

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'app_role', '');
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'owner';
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p where p.auth_user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.compute_attempt_state(
  start_at_utc timestamptz,
  end_at_utc timestamptz,
  upload_deadline_at_utc timestamptz,
  solutions_requested boolean
)
returns text
language sql
stable
as $$
  select case
    when now() < start_at_utc then 'WAITING'
    when now() >= start_at_utc and now() < end_at_utc then 'ACTIVE'
    when solutions_requested
      and upload_deadline_at_utc is not null
      and now() >= end_at_utc
      and now() < upload_deadline_at_utc then 'UPLOAD_ONLY'
    else 'FINISHED_REVIEW'
  end;
$$;

create or replace function public.create_upload_slots_for_attempt(target_attempt_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.upload_slots (attempt_id, question_node_id, required, status)
  select a.id, q.id, a.require_blank_for_skipped, 'pending'
  from public.attempts a
  join public.question_nodes q on q.assessment_version_id = a.assessment_version_id
  where a.id = target_attempt_id
    and q.response_mode in ('upload_pdf', 'typed_or_upload')
  on conflict (attempt_id, question_node_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.generate_moderation_summary(target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  summary jsonb;
begin
  with events as (
    select * from public.attempt_events where attempt_id = target_attempt_id
  ),
  slots as (
    select * from public.upload_slots where attempt_id = target_attempt_id
  )
  select jsonb_build_object(
    'fullscreenExitCount', (select count(*) from events where event_type = 'fullscreen.exit'),
    'visibilityHiddenCount', (select count(*) from events where event_type = 'visibility.hidden'),
    'windowBlurCount', (select count(*) from events where event_type = 'window.blur'),
    'reconnectCount', (select count(*) from events where event_type in ('reconnect', 'network.online')),
    'lateUploadCount', (select count(*) from events where event_type = 'upload.late_denied'),
    'missingSlots', (select count(*) from slots where status = 'missing'),
    'blankPlaceholders', (select count(*) from slots where status = 'blank_placeholder'),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object(
      'event_type', event_type,
      'server_received_at', server_received_at,
      'payload_json', payload_json
    ) order by server_received_at) from events), '[]'::jsonb)
  )
  into summary;

  insert into public.moderation_reports (attempt_id, summary_json)
  values (target_attempt_id, summary)
  on conflict (attempt_id) do update
    set summary_json = excluded.summary_json,
        generated_at = now();

  return summary;
end;
$$;

create index profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index profiles_owner_profile_id_idx on public.profiles(owner_profile_id);
create index assessments_owner_profile_id_idx on public.assessments(owner_profile_id);
create index assessment_versions_assessment_id_idx on public.assessment_versions(assessment_id);
create index question_nodes_version_parent_idx on public.question_nodes(assessment_version_id, parent_node_id, ordinal);
create index attempts_assignee_state_idx on public.attempts(assignee_profile_id, start_at_utc, end_at_utc);
create index attempts_assessment_version_idx on public.attempts(assessment_version_id);
create index attempt_sessions_attempt_id_idx on public.attempt_sessions(attempt_id);
create index attempt_events_attempt_time_idx on public.attempt_events(attempt_id, server_received_at);
create index text_responses_attempt_idx on public.text_responses(attempt_id);
create index upload_slots_attempt_idx on public.upload_slots(attempt_id);

alter table public.profiles enable row level security;
alter table public.owner_settings enable row level security;
alter table public.owner_student_links enable row level security;
alter table public.student_credentials enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_versions enable row level security;
alter table public.question_nodes enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_sessions enable row level security;
alter table public.attempt_events enable row level security;
alter table public.text_responses enable row level security;
alter table public.upload_slots enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.assessment_schedule enable row level security;

create policy "owner reads all profiles" on public.profiles for select to authenticated using (public.is_owner());
create policy "students read own profile" on public.profiles for select to authenticated using (auth_user_id = (select auth.uid()));
create policy "owner updates managed profiles" on public.profiles for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner settings owner only" on public.owner_settings for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner manages student links" on public.owner_student_links for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "student reads own link" on public.owner_student_links for select to authenticated using (student_profile_id = public.current_profile_id());

create policy "owner manages credentials" on public.student_credentials for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner manages own assessments" on public.assessments for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "students read assigned assessment metadata" on public.assessments for select to authenticated using (
  exists (
    select 1 from public.attempts a
    where a.assessment_id = assessments.id
      and a.assignee_profile_id = public.current_profile_id()
  )
);

create policy "owner manages assessment versions" on public.assessment_versions for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner manages question nodes" on public.question_nodes for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner manages attempts" on public.attempts for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "student reads own attempts" on public.attempts for select to authenticated using (assignee_profile_id = public.current_profile_id());

create policy "owner reads sessions" on public.attempt_sessions for select to authenticated using (public.is_owner());
create policy "student creates own sessions" on public.attempt_sessions for insert to authenticated with check (
  exists (
    select 1 from public.attempts a
    where a.id = attempt_sessions.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);
create policy "student reads own sessions" on public.attempt_sessions for select to authenticated using (
  exists (
    select 1 from public.attempts a
    where a.id = attempt_sessions.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);
create policy "student updates own heartbeat" on public.attempt_sessions for update to authenticated using (
  exists (
    select 1 from public.attempts a
    where a.id = attempt_sessions.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
  )
) with check (
  exists (
    select 1 from public.attempts a
    where a.id = attempt_sessions.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);

create policy "owner reads events" on public.attempt_events for select to authenticated using (public.is_owner());
create policy "students append own events" on public.attempt_events for insert to authenticated with check (
  exists (
    select 1 from public.attempts a
    where a.id = attempt_events.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);

create policy "owner reads responses" on public.text_responses for select to authenticated using (public.is_owner());
create policy "students read own responses" on public.text_responses for select to authenticated using (
  exists (
    select 1 from public.attempts a
    where a.id = text_responses.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);
create policy "students write active own responses" on public.text_responses for all to authenticated using (
  exists (
    select 1 from public.attempts a
    where a.id = text_responses.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
      and a.typed_enabled
      and public.compute_attempt_state(a.start_at_utc, a.end_at_utc, a.upload_deadline_at_utc, a.solutions_requested) = 'ACTIVE'
  )
) with check (
  exists (
    select 1 from public.attempts a
    where a.id = text_responses.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
      and a.typed_enabled
      and public.compute_attempt_state(a.start_at_utc, a.end_at_utc, a.upload_deadline_at_utc, a.solutions_requested) = 'ACTIVE'
  )
);

create policy "owner reads upload slots" on public.upload_slots for select to authenticated using (public.is_owner());
create policy "student reads own upload slots" on public.upload_slots for select to authenticated using (
  exists (
    select 1 from public.attempts a
    where a.id = upload_slots.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
  )
);

create policy "owner reads reports" on public.moderation_reports for select to authenticated using (public.is_owner());

create policy "owner manages schedule" on public.assessment_schedule for all to authenticated using (public.is_owner()) with check (public.is_owner());

insert into storage.buckets (id, name, public)
values
  ('assessment-sources', 'assessment-sources', false),
  ('assessment-packages', 'assessment-packages', false),
  ('answer-uploads', 'answer-uploads', false),
  ('marking-packets', 'marking-packets', false)
on conflict (id) do update set public = false;

-- Storage Policies
create policy "owner manages all objects" on storage.objects for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "student reads assigned assessment package" on storage.objects for select to authenticated
  using (
    bucket_id = 'assessment-packages' and
    exists (
      select 1 from public.attempts a
      join public.assessment_versions v on v.id = a.assessment_version_id
      where v.normalized_package_path = storage.objects.name
        and a.assignee_profile_id = public.current_profile_id()
    )
  );

create policy "student manages own answer uploads" on storage.objects for all to authenticated
  using (
    bucket_id = 'answer-uploads' and
    (storage.foldername(name))[1] = 'attempts' and
    exists (
      select 1 from public.attempts a
      where a.id::text = (storage.foldername(name))[2]
        and a.assignee_profile_id = public.current_profile_id()
    )
  )
  with check (
    bucket_id = 'answer-uploads' and
    (storage.foldername(name))[1] = 'attempts' and
    exists (
      select 1 from public.attempts a
      where a.id::text = (storage.foldername(name))[2]
        and a.assignee_profile_id = public.current_profile_id()
    )
  );
