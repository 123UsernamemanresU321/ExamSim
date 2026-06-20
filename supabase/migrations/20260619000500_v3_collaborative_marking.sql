create table if not exists public.assessment_grading_policies (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  anonymous_grading boolean not null default false,
  double_marking boolean not null default false,
  moderation_required boolean not null default false,
  identity_reveal_requires_reason boolean not null default true,
  double_mark_delta_threshold numeric not null default 2 check (double_mark_delta_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id)
);

create table if not exists public.marking_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  marker_profile_id uuid not null references public.profiles(id) on delete cascade,
  marking_round text not null check (marking_round in ('primary', 'secondary', 'adjudication')),
  status text not null default 'submitted' check (status in ('submitted', 'superseded', 'approved', 'rejected')),
  total_awarded_marks numeric not null check (total_awarded_marks >= 0),
  marks_snapshot_json jsonb not null default '[]'::jsonb,
  rubric_awards_snapshot_json jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attempt_id, marker_profile_id, marking_round)
);

create table if not exists public.marking_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  primary_submission_id uuid not null references public.marking_submissions(id) on delete cascade,
  secondary_submission_id uuid null references public.marking_submissions(id) on delete set null,
  reviewer_profile_id uuid null references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'needs_secondary', 'needs_adjudication', 'approved', 'rejected')),
  mark_delta numeric null,
  reviewer_comment text null,
  final_submission_id uuid null references public.marking_submissions(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attempt_id)
);

create index if not exists marking_submissions_owner_status_idx on public.marking_submissions(owner_profile_id, status, submitted_at desc);
create index if not exists marking_submissions_attempt_round_idx on public.marking_submissions(attempt_id, marking_round, submitted_at desc);
create index if not exists marking_reviews_owner_status_idx on public.marking_reviews(owner_profile_id, status, updated_at desc);

alter table public.assessment_grading_policies enable row level security;
alter table public.marking_submissions enable row level security;
alter table public.marking_reviews enable row level security;

grant select, insert, update, delete on public.assessment_grading_policies to authenticated;
grant select, insert, update, delete on public.marking_submissions to authenticated;
grant select, insert, update, delete on public.marking_reviews to authenticated;

create policy institution_grading_policy_read on public.assessment_grading_policies
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'));
create policy institution_grading_policy_authoring on public.assessment_grading_policies
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_marking_submission_read on public.marking_submissions
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'));
create policy institution_marking_submission_self on public.marking_submissions
  for insert to authenticated
  with check (
    marker_profile_id = public.current_profile_id()
    and public.has_institution_permission(owner_profile_id, 'marking')
    and public.owner_profile_id_for_attempt(attempt_id) = owner_profile_id
  );
create policy institution_marking_submission_self_update on public.marking_submissions
  for update to authenticated
  using (marker_profile_id = public.current_profile_id() and public.has_institution_permission(owner_profile_id, 'marking'))
  with check (marker_profile_id = public.current_profile_id() and public.has_institution_permission(owner_profile_id, 'marking'));

create policy institution_marking_review_read on public.marking_reviews
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'));
create policy institution_marking_review_moderation on public.marking_reviews
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'moderation'))
  with check (public.has_institution_permission(owner_profile_id, 'moderation'));

create or replace function public.submit_marking_snapshot(
  p_owner_profile_id uuid,
  p_attempt_id uuid
)
returns table(submission_id uuid, marking_round text, total_awarded_marks numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  target_attempt public.attempts%rowtype;
  grading_policy public.assessment_grading_policies%rowtype;
  primary_submission public.marking_submissions%rowtype;
  selected_round text := 'primary';
  mark_count integer := 0;
  rubric_count integer := 0;
  mark_total numeric := 0;
  rubric_total numeric := 0;
  marks_snapshot jsonb := '[]'::jsonb;
  rubric_snapshot jsonb := '[]'::jsonb;
  target_submission_id uuid;
begin
  if actor_profile_id is null or not public.has_institution_permission(p_owner_profile_id, 'marking') then
    raise exception 'Marking permission required';
  end if;

  select attempt.* into target_attempt
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and public.owner_profile_id_for_attempt(attempt.id) = p_owner_profile_id;
  if not found then raise exception 'Attempt is outside this institution'; end if;

  if exists (
    select 1 from public.institution_memberships membership
    where membership.owner_profile_id = p_owner_profile_id
      and membership.member_profile_id = actor_profile_id
      and membership.status = 'active'
      and membership.role = 'marker'
  ) and not exists (
    select 1 from public.marker_assignments assignment
    where assignment.owner_profile_id = p_owner_profile_id
      and assignment.attempt_id = p_attempt_id
      and assignment.marker_profile_id = actor_profile_id
      and assignment.status in ('assigned', 'in_progress')
  ) then
    raise exception 'Marker assignment required for this attempt';
  end if;

  select grading.* into grading_policy
  from public.assessment_grading_policies grading
  where grading.assessment_id = target_attempt.assessment_id;

  select submission.* into primary_submission
  from public.marking_submissions submission
  where submission.attempt_id = p_attempt_id
    and submission.marking_round = 'primary'
    and submission.status <> 'superseded'
  order by submission.submitted_at desc
  limit 1;

  if coalesce(grading_policy.double_marking, false)
     and primary_submission.id is not null
     and primary_submission.marker_profile_id <> actor_profile_id then
    selected_round := 'secondary';
  end if;

  select
    count(*)::integer,
    coalesce(sum(mark.awarded_marks), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'question_node_id', mark.question_node_id,
      'rubric_criteria_id', mark.rubric_criteria_id,
      'awarded_marks', mark.awarded_marks,
      'notes', mark.notes
    ) order by mark.id), '[]'::jsonb)
  into mark_count, mark_total, marks_snapshot
  from public.marks mark
  where mark.attempt_id = p_attempt_id
    and mark.marker_profile_id = actor_profile_id;

  select
    count(*)::integer,
    coalesce(sum(award.awarded_marks), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'question_node_id', award.question_node_id,
      'rubric_criteria_id', award.rubric_criteria_id,
      'rubric_template_item_id', award.rubric_template_item_id,
      'awarded_marks', award.awarded_marks,
      'selected', award.selected,
      'feedback_text', award.feedback_text
    ) order by award.id), '[]'::jsonb)
  into rubric_count, rubric_total, rubric_snapshot
  from public.rubric_item_awards award
  where award.attempt_id = p_attempt_id
    and award.marker_profile_id = actor_profile_id;

  if mark_count + rubric_count = 0 then
    raise exception 'Save at least one mark or rubric award before submitting';
  end if;

  if exists (
    select 1 from public.marking_submissions submission
    where submission.attempt_id = p_attempt_id
      and submission.marker_profile_id = actor_profile_id
      and submission.marking_round = selected_round
      and submission.status = 'approved'
  ) then
    raise exception 'Approved marking snapshots are immutable';
  end if;

  insert into public.marking_submissions (
    owner_profile_id, attempt_id, marker_profile_id, marking_round, status,
    total_awarded_marks, marks_snapshot_json, rubric_awards_snapshot_json, submitted_at
  ) values (
    p_owner_profile_id, p_attempt_id, actor_profile_id, selected_round, 'submitted',
    mark_total + rubric_total, marks_snapshot, rubric_snapshot, now()
  )
  on conflict (attempt_id, marker_profile_id, marking_round) do update set
    owner_profile_id = excluded.owner_profile_id,
    status = 'submitted',
    total_awarded_marks = excluded.total_awarded_marks,
    marks_snapshot_json = excluded.marks_snapshot_json,
    rubric_awards_snapshot_json = excluded.rubric_awards_snapshot_json,
    submitted_at = excluded.submitted_at,
    updated_at = now()
  returning id into target_submission_id;

  return query select target_submission_id, selected_round, mark_total + rubric_total;
end;
$$;

create or replace function public.review_marking_submission(
  p_owner_profile_id uuid,
  p_review_id uuid,
  p_decision text,
  p_final_submission_id uuid default null,
  p_reviewer_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  target_review public.marking_reviews%rowtype;
  selected_submission_id uuid;
begin
  if actor_profile_id is null or not public.has_institution_permission(p_owner_profile_id, 'moderation') then
    raise exception 'Moderation permission required';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unsupported review decision'; end if;

  select review.* into target_review
  from public.marking_reviews review
  where review.id = p_review_id
    and review.owner_profile_id = p_owner_profile_id
  for update;
  if not found then raise exception 'Review is outside this institution'; end if;
  if target_review.status in ('approved', 'rejected') then raise exception 'Completed reviews are immutable'; end if;

  if p_decision = 'approved' then
    selected_submission_id := coalesce(p_final_submission_id, target_review.primary_submission_id);
    if selected_submission_id is distinct from target_review.primary_submission_id
       and selected_submission_id is distinct from target_review.secondary_submission_id then
      raise exception 'Final submission must belong to this review';
    end if;
  end if;

  update public.marking_reviews
  set status = p_decision,
      reviewer_profile_id = actor_profile_id,
      reviewer_comment = nullif(left(trim(coalesce(p_reviewer_comment, '')), 2000), ''),
      final_submission_id = selected_submission_id,
      reviewed_at = now(),
      updated_at = now()
  where id = target_review.id;

  if p_decision = 'approved' then
    update public.marking_submissions
    set status = case when id = selected_submission_id then 'approved' else 'rejected' end,
        updated_at = now()
    where attempt_id = target_review.attempt_id
      and status <> 'superseded';
  else
    update public.marking_submissions
    set status = 'rejected', updated_at = now()
    where attempt_id = target_review.attempt_id
      and status <> 'superseded';
  end if;
end;
$$;

revoke all on function public.submit_marking_snapshot(uuid, uuid) from public, anon;
revoke all on function public.review_marking_submission(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.submit_marking_snapshot(uuid, uuid) to authenticated, service_role;
grant execute on function public.review_marking_submission(uuid, uuid, text, uuid, text) to authenticated, service_role;

revoke insert, update, delete on public.marking_submissions from authenticated;
revoke insert, update, delete on public.marking_reviews from authenticated;

create or replace function public.reconcile_marking_review(p_owner_profile_id uuid, p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy public.assessment_grading_policies%rowtype;
  primary_submission public.marking_submissions%rowtype;
  secondary_submission public.marking_submissions%rowtype;
  next_status text;
  delta numeric;
  review_id uuid;
begin
  if not public.has_institution_permission(p_owner_profile_id, 'marking') then raise exception 'Marking permission required'; end if;
  if public.owner_profile_id_for_attempt(p_attempt_id) is distinct from p_owner_profile_id then raise exception 'Attempt is outside this institution'; end if;
  select grading.* into policy
  from public.assessment_grading_policies grading
  join public.attempts attempt on attempt.assessment_id = grading.assessment_id
  where attempt.id = p_attempt_id;
  select submission.* into primary_submission from public.marking_submissions submission
  where submission.attempt_id = p_attempt_id and submission.marking_round = 'primary' and submission.status <> 'superseded'
  order by submission.submitted_at desc limit 1;
  if not found then raise exception 'Primary marking submission is required'; end if;
  select submission.* into secondary_submission from public.marking_submissions submission
  where submission.attempt_id = p_attempt_id and submission.marking_round = 'secondary' and submission.status <> 'superseded'
  order by submission.submitted_at desc limit 1;

  if coalesce(policy.double_marking, false) and secondary_submission.id is null then
    next_status := 'needs_secondary';
    delta := null;
  elsif secondary_submission.id is not null then
    delta := abs(primary_submission.total_awarded_marks - secondary_submission.total_awarded_marks);
    next_status := case when delta > coalesce(policy.double_mark_delta_threshold, 2) then 'needs_adjudication' else 'pending' end;
  elsif coalesce(policy.moderation_required, false) then
    next_status := 'pending';
    delta := null;
  else
    next_status := 'approved';
    delta := null;
  end if;

  insert into public.marking_reviews (
    owner_profile_id, attempt_id, primary_submission_id, secondary_submission_id,
    status, mark_delta, final_submission_id, reviewed_at
  ) values (
    p_owner_profile_id, p_attempt_id, primary_submission.id, secondary_submission.id,
    next_status, delta,
    case when next_status = 'approved' then primary_submission.id else null end,
    case when next_status = 'approved' then now() else null end
  )
  on conflict (attempt_id) do update set
    primary_submission_id = excluded.primary_submission_id,
    secondary_submission_id = excluded.secondary_submission_id,
    status = excluded.status,
    mark_delta = excluded.mark_delta,
    final_submission_id = excluded.final_submission_id,
    reviewed_at = excluded.reviewed_at,
    reviewer_profile_id = null,
    reviewer_comment = null,
    updated_at = now()
  returning id into review_id;
  return review_id;
end;
$$;

revoke all on function public.reconcile_marking_review(uuid, uuid) from public;
grant execute on function public.reconcile_marking_review(uuid, uuid) to authenticated, service_role;

drop trigger if exists assessment_grading_policies_set_updated_at on public.assessment_grading_policies;
create trigger assessment_grading_policies_set_updated_at before update on public.assessment_grading_policies
  for each row execute function public.set_updated_at();
drop trigger if exists marking_submissions_set_updated_at on public.marking_submissions;
create trigger marking_submissions_set_updated_at before update on public.marking_submissions
  for each row execute function public.set_updated_at();
drop trigger if exists marking_reviews_set_updated_at on public.marking_reviews;
create trigger marking_reviews_set_updated_at before update on public.marking_reviews
  for each row execute function public.set_updated_at();
