-- Enforce rest-break approval and limits inside the institution timing boundary.

create or replace function public.institution_start_attempt_rest_break(
  p_owner_profile_id uuid,
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
  effective_policy jsonb := '{}'::jsonb;
  rest_break_allowed boolean := false;
  policy_maximum_minutes integer := 0;
  effective_maximum_seconds integer;
begin
  if not public.has_institution_permission(p_owner_profile_id, 'invigilation') then
    raise exception 'Invigilation permission required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Rest-break reason is required';
  end if;
  if p_maximum_seconds < 60 or p_maximum_seconds > 14400 then
    raise exception 'Rest break must be between 1 minute and 4 hours';
  end if;

  select attempt.* into target_attempt
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.exam_session_id = p_exam_session_id
    and public.owner_profile_id_for_attempt(attempt.id) = p_owner_profile_id
  for update;
  if not found then raise exception 'Attempt not found'; end if;

  select
    coalesce(session.settings_json -> 'accommodations', '{}'::jsonb)
      || coalesce(roster.accommodations_json, '{}'::jsonb)
  into effective_policy
  from public.exam_sessions session
  left join public.student_roster_entries roster
    on roster.id = target_attempt.roster_entry_id
   and roster.owner_profile_id = p_owner_profile_id
  where session.id = p_exam_session_id
    and session.owner_profile_id = p_owner_profile_id;
  if not found then raise exception 'Exam session not found'; end if;

  rest_break_allowed := coalesce((effective_policy ->> 'rest_break_allowed')::boolean, false);
  policy_maximum_minutes := case
    when coalesce(effective_policy ->> 'rest_break_max_minutes', '') ~ '^\d{1,3}$'
      then least(240, greatest(0, (effective_policy ->> 'rest_break_max_minutes')::integer))
    else 0
  end;
  if not rest_break_allowed or policy_maximum_minutes < 1 then
    raise exception 'Rest breaks are not approved for this attempt';
  end if;
  effective_maximum_seconds := least(p_maximum_seconds, policy_maximum_minutes * 60);

  if target_attempt.forced_submitted_at is not null or target_attempt.state_cache = 'FINISHED_REVIEW' then
    raise exception 'Finalized attempts cannot be paused';
  end if;
  if target_attempt.paused_at is not null then raise exception 'Attempt is already paused'; end if;
  if now() < target_attempt.start_at_utc or now() >= coalesce(target_attempt.upload_deadline_at_utc, target_attempt.end_at_utc) then
    raise exception 'Attempt is not in a pausable server state';
  end if;

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
    effective_maximum_seconds,
    p_owner_profile_id,
    actor_profile_id
  )
  returning * into created_interval;

  update public.attempts
  set paused_at = created_interval.started_at,
      state_cache = 'PAUSED',
      updated_at = now()
  where id = target_attempt.id;

  return query select created_interval.id, created_interval.started_at;
end;
$$;

revoke all on function public.institution_start_attempt_rest_break(uuid, uuid, uuid, text, integer) from public, anon;
grant execute on function public.institution_start_attempt_rest_break(uuid, uuid, uuid, text, integer) to authenticated, service_role;
