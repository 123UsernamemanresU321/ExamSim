-- Security closure for the V3 institution, Paper Mode, revision, and timing boundaries.

create or replace function public.institution_manages_student(
  target_owner_profile_id uuid,
  target_student_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.owner_student_links link
    where link.owner_profile_id = target_owner_profile_id
      and link.student_profile_id = target_student_profile_id
  ) or exists (
    select 1
    from public.student_roster_entries roster
    where roster.owner_profile_id = target_owner_profile_id
      and roster.student_profile_id = target_student_profile_id
  ) or exists (
    select 1
    from public.profiles profile
    where profile.id = target_student_profile_id
      and profile.owner_profile_id = target_owner_profile_id
      and profile.app_role = 'student'
  );
$$;

revoke all on function public.institution_manages_student(uuid, uuid) from public, anon;
grant execute on function public.institution_manages_student(uuid, uuid) to authenticated, service_role;

drop policy if exists institution_revision_sets_manage on public.revision_sets;
create policy institution_revision_sets_manage on public.revision_sets
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'analytics'))
  with check (
    public.has_institution_permission(owner_profile_id, 'analytics')
    and public.institution_manages_student(owner_profile_id, student_profile_id)
  );

drop policy if exists student_revision_sets_read on public.revision_sets;
create policy student_revision_sets_read on public.revision_sets
  for select to authenticated
  using (exists (
    select 1
    from public.revision_set_assignments assignment
    join public.profiles profile on profile.id = assignment.student_profile_id
    where assignment.revision_set_id = revision_sets.id
      and assignment.student_profile_id = revision_sets.student_profile_id
      and profile.auth_user_id = auth.uid()
      and assignment.status in ('assigned', 'in_progress', 'completed')
  ));

drop policy if exists institution_revision_items_manage on public.revision_set_items;
create policy institution_revision_items_manage on public.revision_set_items
  for all to authenticated
  using (
    public.has_institution_permission(
      (select revision.owner_profile_id from public.revision_sets revision where revision.id = revision_set_items.revision_set_id),
      'analytics'
    )
  )
  with check (exists (
    select 1
    from public.revision_sets revision
    join public.question_bank_items bank on bank.id = revision_set_items.question_bank_item_id
    where revision.id = revision_set_items.revision_set_id
      and bank.owner_profile_id = revision.owner_profile_id
      and public.has_institution_permission(revision.owner_profile_id, 'analytics')
  ));

drop policy if exists institution_revision_assignments_manage on public.revision_set_assignments;
create policy institution_revision_assignments_manage on public.revision_set_assignments
  for all to authenticated
  using (
    public.has_institution_permission(
      (select revision.owner_profile_id from public.revision_sets revision where revision.id = revision_set_assignments.revision_set_id),
      'analytics'
    )
  )
  with check (exists (
    select 1
    from public.revision_sets revision
    where revision.id = revision_set_assignments.revision_set_id
      and revision.student_profile_id = revision_set_assignments.student_profile_id
      and public.institution_manages_student(revision.owner_profile_id, revision_set_assignments.student_profile_id)
      and public.has_institution_permission(revision.owner_profile_id, 'analytics')
  ));

create or replace function public.student_revision_assignments_safe()
returns table(
  assignment_id uuid,
  revision_set_id uuid,
  set_title text,
  rationale text,
  assignment_status text,
  assigned_at timestamptz,
  item_id uuid,
  ordinal integer,
  priority text,
  reason text,
  question_title text,
  prompt_html text,
  prompt_latex text,
  marks_available numeric,
  answer_mode text,
  tags text[]
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    assignment.id,
    revision.id,
    revision.title,
    revision.rationale,
    assignment.status,
    assignment.assigned_at,
    item.id,
    item.ordinal,
    item.priority,
    item.reason,
    bank.title,
    bank.prompt_html,
    bank.prompt_latex,
    bank.marks_available,
    bank.answer_mode,
    bank.tags
  from public.revision_set_assignments assignment
  join public.profiles profile on profile.id = assignment.student_profile_id
  join public.revision_sets revision
    on revision.id = assignment.revision_set_id
   and revision.student_profile_id = assignment.student_profile_id
  join public.revision_set_items item on item.revision_set_id = revision.id
  join public.question_bank_items bank
    on bank.id = item.question_bank_item_id
   and bank.owner_profile_id = revision.owner_profile_id
  where profile.auth_user_id = auth.uid()
    and assignment.status in ('assigned', 'in_progress', 'completed')
    and revision.status in ('assigned', 'completed')
    and bank.readiness_status = 'ready'
    and not bank.do_not_reuse
  order by assignment.assigned_at desc, item.ordinal;
$$;

revoke all on function public.student_revision_assignments_safe() from public, anon;
grant execute on function public.student_revision_assignments_safe() to authenticated;

create or replace function public.institution_apply_attempt_accommodation(
  p_owner_profile_id uuid,
  p_attempt_id uuid,
  p_accommodation_type text,
  p_extra_seconds integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attempt public.attempts%rowtype;
  actor_profile_id uuid := public.current_profile_id();
  accommodation_id uuid;
  previous_end_at timestamptz;
  previous_upload_deadline timestamptz;
begin
  if not public.has_institution_permission(p_owner_profile_id, 'invigilation') then
    raise exception 'Invigilation permission required';
  end if;
  if p_accommodation_type not in ('extra_time', 'upload_extension', 'manual_reopen_upload') then
    raise exception 'Unsupported accommodation type';
  end if;
  if p_extra_seconds < 60 or p_extra_seconds > 7200 then
    raise exception 'Accommodation time must be between 1 and 120 minutes';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(trim(p_reason)) > 1000 then
    raise exception 'Accommodation reason must be between 3 and 1000 characters';
  end if;

  select attempt.*
  into target_attempt
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and public.owner_profile_id_for_attempt(attempt.id) = p_owner_profile_id
  for update;
  if not found then raise exception 'Attempt not found'; end if;
  if target_attempt.forced_submitted_at is not null or target_attempt.state_cache = 'FINISHED_REVIEW' then
    raise exception 'Finalized attempts cannot receive accommodations';
  end if;

  previous_end_at := target_attempt.end_at_utc;
  previous_upload_deadline := target_attempt.upload_deadline_at_utc;
  if p_accommodation_type = 'extra_time' then
    if now() >= coalesce(target_attempt.upload_deadline_at_utc, target_attempt.end_at_utc) then
      raise exception 'Attempt timing window has finished';
    end if;
    update public.attempts
    set end_at_utc = end_at_utc + pg_catalog.make_interval(secs => p_extra_seconds),
        upload_deadline_at_utc = case
          when upload_deadline_at_utc is null then null
          else upload_deadline_at_utc + pg_catalog.make_interval(secs => p_extra_seconds)
        end,
        state_cache = null,
        updated_at = now()
    where id = target_attempt.id
    returning end_at_utc, upload_deadline_at_utc
      into target_attempt.end_at_utc, target_attempt.upload_deadline_at_utc;
  elsif p_accommodation_type = 'upload_extension' then
    if now() >= coalesce(target_attempt.upload_deadline_at_utc, target_attempt.end_at_utc) then
      raise exception 'Upload window has finished; use an audited manual reopen instead';
    end if;
    update public.attempts
    set upload_deadline_at_utc = coalesce(upload_deadline_at_utc, end_at_utc) + pg_catalog.make_interval(secs => p_extra_seconds),
        state_cache = null,
        updated_at = now()
    where id = target_attempt.id
    returning end_at_utc, upload_deadline_at_utc
      into target_attempt.end_at_utc, target_attempt.upload_deadline_at_utc;
  else
    update public.attempts
    set upload_deadline_at_utc = now() + pg_catalog.make_interval(secs => p_extra_seconds),
        state_cache = null,
        updated_at = now()
    where id = target_attempt.id
    returning end_at_utc, upload_deadline_at_utc
      into target_attempt.end_at_utc, target_attempt.upload_deadline_at_utc;
  end if;

  insert into public.attempt_accommodations (
    attempt_id,
    created_by_profile_id,
    accommodation_type,
    extra_seconds,
    reason
  ) values (
    target_attempt.id,
    actor_profile_id,
    p_accommodation_type,
    p_extra_seconds,
    trim(p_reason)
  ) returning id into accommodation_id;

  return jsonb_build_object(
    'accommodation_id', accommodation_id,
    'accommodation_type', p_accommodation_type,
    'extra_seconds', p_extra_seconds,
    'previous_end_at_utc', previous_end_at,
    'new_end_at_utc', target_attempt.end_at_utc,
    'previous_upload_deadline_at_utc', previous_upload_deadline,
    'new_upload_deadline_at_utc', target_attempt.upload_deadline_at_utc
  );
end;
$$;

revoke all on function public.institution_apply_attempt_accommodation(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.institution_apply_attempt_accommodation(uuid, uuid, text, integer, text) to authenticated;

create or replace function public.validate_paper_mode_job_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_assessment_id uuid;
  assessment_owner_profile_id uuid;
begin
  select version.assessment_id, assessment.owner_profile_id
  into version_assessment_id, assessment_owner_profile_id
  from public.assessment_versions version
  join public.assessments assessment on assessment.id = version.assessment_id
  where version.id = new.assessment_version_id;
  if not found or version_assessment_id <> new.assessment_id then
    raise exception 'assessment_version_id does not belong to this assessment';
  end if;
  if assessment_owner_profile_id <> new.owner_profile_id then
    raise exception 'Paper Mode assessment is outside this institution';
  end if;
  return new;
end;
$$;

drop trigger if exists paper_mode_jobs_validate_references on public.paper_mode_jobs;
create trigger paper_mode_jobs_validate_references
  before insert or update of owner_profile_id, assessment_id, assessment_version_id
  on public.paper_mode_jobs
  for each row execute function public.validate_paper_mode_job_references();

create or replace function public.validate_paper_mode_booklet_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.paper_mode_jobs%rowtype;
  roster public.student_roster_entries%rowtype;
  attempt public.attempts%rowtype;
begin
  select * into job from public.paper_mode_jobs where id = new.paper_mode_job_id;
  if not found then raise exception 'Paper Mode job not found'; end if;
  if new.roster_entry_id is not null then
    select * into roster from public.student_roster_entries where id = new.roster_entry_id;
    if not found or roster.owner_profile_id <> job.owner_profile_id then
      raise exception 'roster_entry_id is outside this institution';
    end if;
    if new.student_profile_id is not null and roster.student_profile_id is distinct from new.student_profile_id then
      raise exception 'student_profile_id does not match this roster entry';
    end if;
  elsif new.student_profile_id is not null and not public.institution_manages_student(job.owner_profile_id, new.student_profile_id) then
    raise exception 'student_profile_id is outside this institution';
  end if;
  if new.attempt_id is not null then
    select * into attempt from public.attempts where id = new.attempt_id;
    if not found
      or attempt.assessment_id <> job.assessment_id
      or attempt.assessment_version_id <> job.assessment_version_id
      or (new.roster_entry_id is not null and attempt.roster_entry_id is distinct from new.roster_entry_id)
      or (new.student_profile_id is not null and attempt.assignee_profile_id is distinct from new.student_profile_id)
    then
      raise exception 'attempt_id does not belong to this Paper Mode booklet';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists paper_mode_booklets_validate_references on public.paper_mode_booklets;
create trigger paper_mode_booklets_validate_references
  before insert or update of paper_mode_job_id, roster_entry_id, student_profile_id, attempt_id
  on public.paper_mode_booklets
  for each row execute function public.validate_paper_mode_booklet_references();

create or replace function public.validate_paper_mode_scan_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.paper_mode_jobs%rowtype;
  expected_prefix text;
begin
  select * into job from public.paper_mode_jobs where id = new.paper_mode_job_id;
  if not found then raise exception 'Paper Mode job not found'; end if;
  expected_prefix := job.owner_profile_id::text || '/paper-jobs/' || job.id::text || '/scans/';
  if new.object_path not like (expected_prefix || '%')
    or position('..' in new.object_path) > 0
    or lower(right(new.object_path, 4)) <> '.pdf'
  then
    raise exception 'Paper Mode scan object path is outside this job';
  end if;
  return new;
end;
$$;

drop trigger if exists paper_mode_scans_validate_references on public.paper_mode_scans;
create trigger paper_mode_scans_validate_references
  before insert or update of paper_mode_job_id, object_path
  on public.paper_mode_scans
  for each row execute function public.validate_paper_mode_scan_references();

create or replace function public.validate_paper_mode_scan_page_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  scan public.paper_mode_scans%rowtype;
  job public.paper_mode_jobs%rowtype;
  booklet public.paper_mode_booklets%rowtype;
  attempt public.attempts%rowtype;
  question public.question_nodes%rowtype;
begin
  select * into scan from public.paper_mode_scans where id = new.paper_mode_scan_id;
  if not found then raise exception 'Paper Mode scan not found'; end if;
  select * into job from public.paper_mode_jobs where id = scan.paper_mode_job_id;
  if not found then raise exception 'Paper Mode job not found'; end if;

  if new.mapping_status = 'mapped'
    and (new.booklet_id is null or new.attempt_id is null or new.question_node_id is null)
  then
    raise exception 'Mapped Paper Mode pages require booklet, attempt, and question references';
  end if;

  if new.booklet_id is not null then
    select * into booklet from public.paper_mode_booklets where id = new.booklet_id;
    if not found or booklet.paper_mode_job_id <> job.id then
      raise exception 'booklet_id does not belong to this Paper Mode job';
    end if;
  end if;
  if new.attempt_id is not null then
    select * into attempt from public.attempts where id = new.attempt_id;
    if not found
      or attempt.assessment_id <> job.assessment_id
      or attempt.assessment_version_id <> job.assessment_version_id
      or (new.booklet_id is not null and booklet.attempt_id is distinct from new.attempt_id)
    then
      raise exception 'attempt_id does not belong to this Paper Mode job';
    end if;
  end if;
  if new.question_node_id is not null then
    select * into question from public.question_nodes where id = new.question_node_id;
    if not found or question.assessment_version_id <> job.assessment_version_id then
      raise exception 'question_node_id does not belong to this Paper Mode assessment version';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists paper_mode_scan_pages_validate_references on public.paper_mode_scan_pages;
create trigger paper_mode_scan_pages_validate_references
  before insert or update of paper_mode_scan_id, booklet_id, attempt_id, question_node_id, mapping_status
  on public.paper_mode_scan_pages
  for each row execute function public.validate_paper_mode_scan_page_references();

alter function public.institution_generate_paper_mode_booklets(uuid) set search_path = '';

create or replace function public.validate_curriculum_standard_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_standard_id is not null and not exists (
    select 1
    from public.curriculum_standards parent
    where parent.id = new.parent_standard_id
      and parent.owner_profile_id = new.owner_profile_id
      and parent.framework_id = new.framework_id
  ) then
    raise exception 'Parent standard must belong to the same framework and institution';
  end if;
  return new;
end;
$$;

drop trigger if exists curriculum_standards_validate_parent on public.curriculum_standards;
create trigger curriculum_standards_validate_parent
  before insert or update of owner_profile_id, framework_id, parent_standard_id
  on public.curriculum_standards
  for each row execute function public.validate_curriculum_standard_parent();

drop policy if exists institution_export_history_insert on public.export_download_history;
create policy institution_export_history_insert on public.export_download_history
  for insert to authenticated
  with check (
    public.has_institution_permission(owner_profile_id, 'exports')
    and actor_profile_id = public.current_profile_id()
    and (
      assessment_id is null
      or exists (
        select 1
        from public.assessments assessment
        where assessment.id = export_download_history.assessment_id
          and assessment.owner_profile_id = export_download_history.owner_profile_id
      )
    )
    and (
      object_path is null
      or split_part(object_path, '/', 1) = owner_profile_id::text
    )
  );

revoke all on function public.validate_paper_mode_job_references() from public, anon, authenticated;
revoke all on function public.validate_paper_mode_booklet_references() from public, anon, authenticated;
revoke all on function public.validate_paper_mode_scan_references() from public, anon, authenticated;
revoke all on function public.validate_paper_mode_scan_page_references() from public, anon, authenticated;
revoke all on function public.validate_curriculum_standard_parent() from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.revision_set_items item
    join public.revision_sets revision on revision.id = item.revision_set_id
    join public.question_bank_items bank on bank.id = item.question_bank_item_id
    where bank.owner_profile_id <> revision.owner_profile_id
  ) then
    raise exception 'Existing revision set contains a cross-institution question reference';
  end if;
  if exists (
    select 1
    from public.revision_set_assignments assignment
    join public.revision_sets revision on revision.id = assignment.revision_set_id
    where assignment.student_profile_id <> revision.student_profile_id
       or not public.institution_manages_student(revision.owner_profile_id, assignment.student_profile_id)
  ) then
    raise exception 'Existing revision assignment is outside its institution student boundary';
  end if;
  if exists (
    select 1
    from public.paper_mode_jobs job
    join public.assessment_versions version on version.id = job.assessment_version_id
    join public.assessments assessment on assessment.id = version.assessment_id
    where version.assessment_id <> job.assessment_id
       or assessment.owner_profile_id <> job.owner_profile_id
  ) then
    raise exception 'Existing Paper Mode job has inconsistent assessment ownership';
  end if;
  if exists (
    select 1
    from public.paper_mode_scan_pages page
    join public.paper_mode_scans scan on scan.id = page.paper_mode_scan_id
    join public.paper_mode_jobs job on job.id = scan.paper_mode_job_id
    left join public.paper_mode_booklets booklet on booklet.id = page.booklet_id
    left join public.attempts attempt on attempt.id = page.attempt_id
    left join public.question_nodes question on question.id = page.question_node_id
    where (page.booklet_id is not null and booklet.paper_mode_job_id is distinct from job.id)
       or (page.attempt_id is not null and (
         attempt.assessment_id is distinct from job.assessment_id
         or attempt.assessment_version_id is distinct from job.assessment_version_id
         or (page.booklet_id is not null and booklet.attempt_id is distinct from page.attempt_id)
       ))
       or (page.question_node_id is not null and question.assessment_version_id is distinct from job.assessment_version_id)
  ) then
    raise exception 'Existing Paper Mode scan page has inconsistent mapping references';
  end if;
end;
$$;
