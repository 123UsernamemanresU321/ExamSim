create table if not exists public.answer_grouping_runs (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null default 'deterministic' check (provider in ('deterministic', 'semantic')),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'applied', 'cancelled')),
  response_count integer not null default 0 check (response_count >= 0),
  applied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.answer_groups (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  run_id uuid not null references public.answer_grouping_runs(id) on delete cascade,
  ordinal integer not null default 0 check (ordinal >= 0),
  label text not null check (length(label) between 1 and 240),
  normalized_answer text not null default '',
  confidence text not null default 'manual_review' check (confidence in ('exact', 'normalized', 'semantic', 'manual_review')),
  approved boolean not null default false,
  suggested_awarded_marks numeric null check (suggested_awarded_marks >= 0),
  feedback_text text null check (feedback_text is null or length(feedback_text) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, ordinal)
);

create table if not exists public.answer_group_members (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  run_id uuid not null references public.answer_grouping_runs(id) on delete cascade,
  group_id uuid not null references public.answer_groups(id) on delete cascade,
  text_response_id uuid not null references public.text_responses(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  original_normalized_answer text not null default '',
  created_at timestamptz not null default now(),
  unique(run_id, text_response_id)
);

create table if not exists public.answer_group_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  run_id uuid not null references public.answer_grouping_runs(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'member_moved', 'group_split', 'groups_merged', 'group_approved', 'group_reopened', 'run_reviewed', 'marks_applied', 'cancelled')),
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists answer_grouping_runs_owner_question_idx
  on public.answer_grouping_runs(owner_profile_id, assessment_id, question_node_id, created_at desc);
create index if not exists answer_groups_run_idx on public.answer_groups(run_id, ordinal);
create index if not exists answer_group_members_run_group_idx on public.answer_group_members(run_id, group_id);
create index if not exists answer_group_audit_events_run_idx on public.answer_group_audit_events(run_id, created_at desc);

alter table public.answer_grouping_runs enable row level security;
alter table public.answer_groups enable row level security;
alter table public.answer_group_members enable row level security;
alter table public.answer_group_audit_events enable row level security;

create policy institution_answer_grouping_runs on public.answer_grouping_runs
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'))
  with check (
    public.has_institution_permission(owner_profile_id, 'marking')
    and exists (
      select 1 from public.assessments assessment
      where assessment.id = answer_grouping_runs.assessment_id
        and assessment.owner_profile_id = answer_grouping_runs.owner_profile_id
    )
    and exists (
      select 1
      from public.question_nodes node
      join public.assessment_versions version on version.id = node.assessment_version_id
      where node.id = answer_grouping_runs.question_node_id
        and version.assessment_id = answer_grouping_runs.assessment_id
    )
  );

create policy institution_answer_groups on public.answer_groups
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'))
  with check (
    public.has_institution_permission(owner_profile_id, 'marking')
    and exists (
      select 1 from public.answer_grouping_runs run
      where run.id = answer_groups.run_id
        and run.owner_profile_id = answer_groups.owner_profile_id
    )
  );

create policy institution_answer_group_members on public.answer_group_members
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'))
  with check (
    public.has_institution_permission(owner_profile_id, 'marking')
    and exists (
      select 1 from public.answer_grouping_runs run
      where run.id = answer_group_members.run_id
        and run.owner_profile_id = answer_group_members.owner_profile_id
    )
    and exists (
      select 1 from public.answer_groups answer_group
      where answer_group.id = answer_group_members.group_id
        and answer_group.run_id = answer_group_members.run_id
        and answer_group.owner_profile_id = answer_group_members.owner_profile_id
    )
    and exists (
      select 1
      from public.text_responses response
      join public.attempts attempt on attempt.id = response.attempt_id
      join public.answer_grouping_runs run on run.id = answer_group_members.run_id
      where response.id = answer_group_members.text_response_id
        and response.attempt_id = answer_group_members.attempt_id
        and response.question_node_id = run.question_node_id
        and attempt.assessment_id = run.assessment_id
    )
  );

create policy institution_answer_group_audit_read on public.answer_group_audit_events
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'));

create policy institution_answer_group_audit_insert on public.answer_group_audit_events
  for insert to authenticated
  with check (
    actor_profile_id = public.current_profile_id()
    and public.has_institution_permission(owner_profile_id, 'marking')
    and exists (
      select 1 from public.answer_grouping_runs run
      where run.id = answer_group_audit_events.run_id
        and run.owner_profile_id = answer_group_audit_events.owner_profile_id
    )
  );

create or replace function public.apply_answer_grouping_run(p_run_id uuid, p_actor_profile_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_row public.answer_grouping_runs%rowtype;
  question_max numeric;
  member_total integer;
  inserted_count integer;
begin
  if p_actor_profile_id is distinct from public.current_profile_id() then
    raise exception 'The current profile must apply grouped marks';
  end if;

  select run.* into run_row
  from public.answer_grouping_runs run
  where run.id = p_run_id
  for update;

  if not found then raise exception 'Answer grouping run not found'; end if;
  if not public.has_institution_permission(run_row.owner_profile_id, 'marking') then
    raise exception 'Marking permission required';
  end if;
  if run_row.status <> 'reviewed' then
    raise exception 'Answer grouping run must be fully reviewed before marks are applied';
  end if;

  select node.marks into question_max
  from public.question_nodes node
  where node.id = run_row.question_node_id;
  if question_max is null or question_max < 0 then
    raise exception 'Question maximum is required before grouped marks can be applied';
  end if;

  if exists (
    select 1 from public.answer_groups answer_group
    where answer_group.run_id = p_run_id
      and (not answer_group.approved or answer_group.suggested_awarded_marks is null or answer_group.suggested_awarded_marks > question_max)
  ) then
    raise exception 'All groups must be approved with valid marks';
  end if;

  select count(*) into member_total
  from public.answer_group_members member
  join public.text_responses response on response.id = member.text_response_id
  join public.attempts attempt on attempt.id = member.attempt_id
  where member.run_id = p_run_id
    and response.attempt_id = member.attempt_id
    and response.question_node_id = run_row.question_node_id
    and attempt.assessment_id = run_row.assessment_id;
  if member_total <> run_row.response_count then
    raise exception 'Grouping membership no longer matches the reviewed response set';
  end if;

  delete from public.marks mark
  where mark.marker_profile_id = p_actor_profile_id
    and mark.question_node_id = run_row.question_node_id
    and mark.rubric_criteria_id is null
    and mark.attempt_id in (
      select member.attempt_id from public.answer_group_members member where member.run_id = p_run_id
    );

  insert into public.marks (
    attempt_id, question_node_id, rubric_criteria_id, marker_profile_id, awarded_marks, notes
  )
  select
    member.attempt_id,
    run_row.question_node_id,
    null,
    p_actor_profile_id,
    answer_group.suggested_awarded_marks,
    nullif(concat('Answer group: ', answer_group.label, case when answer_group.feedback_text is not null then E'\n' || answer_group.feedback_text else '' end), '')
  from public.answer_group_members member
  join public.answer_groups answer_group on answer_group.id = member.group_id
  where member.run_id = p_run_id;
  get diagnostics inserted_count = row_count;

  update public.answer_grouping_runs
  set status = 'applied', applied_at = now(), updated_at = now()
  where id = p_run_id;

  insert into public.answer_group_audit_events (
    owner_profile_id, run_id, actor_profile_id, event_type, payload_json
  ) values (
    run_row.owner_profile_id, p_run_id, p_actor_profile_id, 'marks_applied',
    jsonb_build_object('mark_count', inserted_count, 'question_node_id', run_row.question_node_id)
  );

  return inserted_count;
end;
$$;

revoke all on function public.apply_answer_grouping_run(uuid, uuid) from public;
grant execute on function public.apply_answer_grouping_run(uuid, uuid) to authenticated;

grant select, insert, update, delete on public.answer_grouping_runs to authenticated;
grant select, insert, update, delete on public.answer_groups to authenticated;
grant select, insert, update, delete on public.answer_group_members to authenticated;
grant select, insert on public.answer_group_audit_events to authenticated;

drop trigger if exists answer_grouping_runs_set_updated_at on public.answer_grouping_runs;
create trigger answer_grouping_runs_set_updated_at before update on public.answer_grouping_runs
  for each row execute function public.set_updated_at();
drop trigger if exists answer_groups_set_updated_at on public.answer_groups;
create trigger answer_groups_set_updated_at before update on public.answer_groups
  for each row execute function public.set_updated_at();
