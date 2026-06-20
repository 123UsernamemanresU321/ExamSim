-- Server-controlled rest breaks with atomic deadline extension on resume.

alter table public.attempts drop constraint if exists attempts_state_cache_check;
alter table public.attempts
  add constraint attempts_state_cache_check
  check (state_cache is null or state_cache in ('WAITING', 'ACTIVE', 'PAUSED', 'UPLOAD_ONLY', 'FINISHED_REVIEW'));

create table if not exists public.attempt_pause_intervals (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  exam_session_id uuid null references public.exam_sessions(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  applied_seconds integer null check (applied_seconds is null or applied_seconds >= 0),
  maximum_seconds integer not null default 7200 check (maximum_seconds between 60 and 14400),
  reason text not null,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  ended_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists attempt_pause_intervals_one_open_idx
  on public.attempt_pause_intervals(attempt_id)
  where ended_at is null;

create index if not exists attempt_pause_intervals_attempt_started_idx
  on public.attempt_pause_intervals(attempt_id, started_at desc);

alter table public.attempt_pause_intervals enable row level security;
grant select, insert, update, delete on public.attempt_pause_intervals to authenticated;

drop policy if exists "owner manages attempt pause intervals" on public.attempt_pause_intervals;
create policy "owner manages attempt pause intervals"
  on public.attempt_pause_intervals
  for all
  to authenticated
  using (
    public.is_owner()
    and owner_profile_id = public.current_profile_id()
    and exists (
      select 1
      from public.attempts a
      join public.assessments ass on ass.id = a.assessment_id
      where a.id = attempt_pause_intervals.attempt_id
        and ass.owner_profile_id = public.current_profile_id()
    )
  )
  with check (
    public.is_owner()
    and owner_profile_id = public.current_profile_id()
    and created_by_profile_id = public.current_profile_id()
    and exists (
      select 1
      from public.attempts a
      join public.assessments ass on ass.id = a.assessment_id
      where a.id = attempt_pause_intervals.attempt_id
        and ass.owner_profile_id = public.current_profile_id()
    )
  );

create or replace function public.start_attempt_rest_break(
  p_attempt_id uuid,
  p_exam_session_id uuid,
  p_reason text,
  p_maximum_seconds integer default 7200
)
returns table(pause_interval_id uuid, started_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  target_attempt public.attempts%rowtype;
  created_interval public.attempt_pause_intervals%rowtype;
begin
  if not public.is_owner() or actor_profile_id is null then
    raise exception 'Owner role required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Rest-break reason is required';
  end if;
  if p_maximum_seconds < 60 or p_maximum_seconds > 14400 then
    raise exception 'Rest break must be between 1 minute and 4 hours';
  end if;

  select a.*
  into target_attempt
  from public.attempts a
  join public.assessments ass on ass.id = a.assessment_id
  where a.id = p_attempt_id
    and a.exam_session_id = p_exam_session_id
    and ass.owner_profile_id = actor_profile_id
  for update of a;

  if not found then raise exception 'Attempt not found'; end if;
  if target_attempt.forced_submitted_at is not null or target_attempt.state_cache = 'FINISHED_REVIEW' then
    raise exception 'Finalized attempts cannot be paused';
  end if;
  if target_attempt.paused_at is not null then raise exception 'Attempt is already paused'; end if;

  insert into public.attempt_pause_intervals (
    attempt_id,
    exam_session_id,
    reason,
    maximum_seconds,
    owner_profile_id,
    created_by_profile_id
  ) values (
    target_attempt.id,
    p_exam_session_id,
    trim(p_reason),
    p_maximum_seconds,
    actor_profile_id,
    actor_profile_id
  ) returning * into created_interval;

  update public.attempts
  set paused_at = created_interval.started_at,
      state_cache = 'PAUSED',
      updated_at = now()
  where id = target_attempt.id;

  return query select created_interval.id, created_interval.started_at;
end;
$$;

create or replace function public.resume_attempt_rest_break(
  p_attempt_id uuid,
  p_exam_session_id uuid
)
returns table(
  pause_interval_id uuid,
  applied_seconds integer,
  new_end_at_utc timestamptz,
  new_upload_deadline_at_utc timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  target_attempt public.attempts%rowtype;
  open_interval public.attempt_pause_intervals%rowtype;
  elapsed_seconds integer;
begin
  if not public.is_owner() or actor_profile_id is null then
    raise exception 'Owner role required';
  end if;

  select a.*
  into target_attempt
  from public.attempts a
  join public.assessments ass on ass.id = a.assessment_id
  where a.id = p_attempt_id
    and a.exam_session_id = p_exam_session_id
    and ass.owner_profile_id = actor_profile_id
  for update of a;

  if not found then raise exception 'Attempt not found'; end if;

  select pi.*
  into open_interval
  from public.attempt_pause_intervals pi
  where pi.attempt_id = target_attempt.id
    and pi.ended_at is null
  for update;

  if not found or target_attempt.paused_at is null then
    raise exception 'Attempt is not paused';
  end if;

  elapsed_seconds := least(
    open_interval.maximum_seconds,
    greatest(0, floor(extract(epoch from (now() - open_interval.started_at)))::integer)
  );

  update public.attempt_pause_intervals
  set ended_at = now(),
      ended_by_profile_id = actor_profile_id,
      applied_seconds = elapsed_seconds
  where id = open_interval.id;

  update public.attempts
  set end_at_utc = end_at_utc + make_interval(secs => elapsed_seconds),
      upload_deadline_at_utc = case
        when upload_deadline_at_utc is null then null
        else upload_deadline_at_utc + make_interval(secs => elapsed_seconds)
      end,
      paused_at = null,
      state_cache = null,
      updated_at = now()
  where id = target_attempt.id
  returning end_at_utc, upload_deadline_at_utc
  into target_attempt.end_at_utc, target_attempt.upload_deadline_at_utc;

  return query select
    open_interval.id,
    elapsed_seconds,
    target_attempt.end_at_utc,
    target_attempt.upload_deadline_at_utc;
end;
$$;

revoke all on function public.start_attempt_rest_break(uuid, uuid, text, integer) from public, anon;
revoke all on function public.resume_attempt_rest_break(uuid, uuid) from public, anon;
grant execute on function public.start_attempt_rest_break(uuid, uuid, text, integer) to authenticated;
grant execute on function public.resume_attempt_rest_break(uuid, uuid) to authenticated;
