-- V3 institution collaborator rollout.
-- Existing owner policies remain in place. These additional policies grant only
-- the workflow permission attached to an active owner-scoped membership.

create or replace function public.has_institution_permission(target_owner_profile_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      target_owner_profile_id = public.current_profile_id()
      and public.is_owner()
    )
    or exists (
      select 1
      from public.institution_memberships membership
      where membership.owner_profile_id = target_owner_profile_id
        and membership.member_profile_id = public.current_profile_id()
        and membership.status = 'active'
        and required_permission = any (
          case membership.role
            when 'owner_admin' then array[
              'assessment_authoring', 'session_publishing', 'marking', 'moderation',
              'invigilation', 'exports', 'analytics', 'student_data',
              'student_management', 'readiness_security'
            ]::text[]
            when 'teacher' then array[
              'assessment_authoring', 'session_publishing', 'marking', 'moderation',
              'invigilation', 'exports', 'analytics', 'student_data', 'student_management'
            ]::text[]
            when 'marker' then array['marking', 'student_data']::text[]
            when 'reviewer' then array['marking', 'moderation', 'analytics', 'student_data']::text[]
            when 'invigilator' then array['invigilation', 'student_data']::text[]
            when 'read_only' then array['analytics', 'student_data']::text[]
            else array[]::text[]
          end
        )
    );
$$;

revoke all on function public.has_institution_permission(uuid, text) from public;
grant execute on function public.has_institution_permission(uuid, text) to authenticated, service_role;

create or replace function public.owner_profile_id_for_attempt(target_attempt_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select assessment.owner_profile_id
  from public.attempts attempt
  join public.assessments assessment on assessment.id = attempt.assessment_id
  where attempt.id = target_attempt_id;
$$;

revoke all on function public.owner_profile_id_for_attempt(uuid) from public;
grant execute on function public.owner_profile_id_for_attempt(uuid) to authenticated, service_role;

create or replace function public.storage_owner_profile_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function public.storage_owner_profile_id(text) from public;
grant execute on function public.storage_owner_profile_id(text) to authenticated, service_role;

create policy institution_assessment_source_storage on storage.objects
  for all to authenticated
  using (
    bucket_id = 'assessment-sources'
    and public.has_institution_permission(public.storage_owner_profile_id(name), 'assessment_authoring')
  )
  with check (
    bucket_id = 'assessment-sources'
    and public.has_institution_permission(public.storage_owner_profile_id(name), 'assessment_authoring')
  );

create policy institution_assessment_package_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assessment-packages'
    and public.has_institution_permission(public.storage_owner_profile_id(name), 'assessment_authoring')
  );

-- Assessment authoring and source review.
create policy institution_assessment_authoring on public.assessments
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_assessment_version_authoring on public.assessment_versions
  for all to authenticated
  using (public.has_institution_permission((select a.owner_profile_id from public.assessments a where a.id = assessment_versions.assessment_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select a.owner_profile_id from public.assessments a where a.id = assessment_versions.assessment_id), 'assessment_authoring'));

create policy institution_question_node_authoring on public.question_nodes
  for all to authenticated
  using (public.has_institution_permission((select a.owner_profile_id from public.assessment_versions v join public.assessments a on a.id = v.assessment_id where v.id = question_nodes.assessment_version_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select a.owner_profile_id from public.assessment_versions v join public.assessments a on a.id = v.assessment_id where v.id = question_nodes.assessment_version_id), 'assessment_authoring'));

create policy institution_source_document_authoring on public.source_documents
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_source_page_authoring on public.source_pages
  for all to authenticated
  using (public.has_institution_permission((select d.owner_profile_id from public.source_documents d where d.id = source_pages.source_document_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select d.owner_profile_id from public.source_documents d where d.id = source_pages.source_document_id), 'assessment_authoring'));

create policy institution_source_region_authoring on public.question_source_regions
  for all to authenticated
  using (public.has_institution_permission((select d.owner_profile_id from public.source_documents d where d.id = question_source_regions.source_document_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select d.owner_profile_id from public.source_documents d where d.id = question_source_regions.source_document_id), 'assessment_authoring'));

create policy institution_rubric_template_authoring on public.rubric_templates
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_rubric_template_item_authoring on public.rubric_template_items
  for all to authenticated
  using (public.has_institution_permission((select t.owner_profile_id from public.rubric_templates t where t.id = rubric_template_items.rubric_template_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select t.owner_profile_id from public.rubric_templates t where t.id = rubric_template_items.rubric_template_id), 'assessment_authoring'));

create policy institution_rubric_authoring on public.rubrics
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_rubric_criteria_authoring on public.rubric_criteria
  for all to authenticated
  using (public.has_institution_permission((select r.owner_profile_id from public.rubrics r where r.id = rubric_criteria.rubric_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select r.owner_profile_id from public.rubrics r where r.id = rubric_criteria.rubric_id), 'assessment_authoring'));

create policy institution_parse_job_authoring on public.parse_jobs
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_parse_artifact_authoring on public.parse_job_artifacts
  for all to authenticated
  using (public.has_institution_permission((select j.owner_profile_id from public.parse_jobs j where j.id = parse_job_artifacts.parse_job_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select j.owner_profile_id from public.parse_jobs j where j.id = parse_job_artifacts.parse_job_id), 'assessment_authoring'));

create policy institution_ai_suggestion_authoring on public.ai_parse_suggestions
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_ocr_result_authoring on public.ocr_provider_results
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_question_library_authoring on public.question_bank_items
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_question_library_child_authoring on public.question_bank_children
  for all to authenticated
  using (public.has_institution_permission((select q.owner_profile_id from public.question_bank_items q where q.id = question_bank_children.question_bank_item_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select q.owner_profile_id from public.question_bank_items q where q.id = question_bank_children.question_bank_item_id), 'assessment_authoring'));

create policy institution_generated_paper_authoring on public.generated_papers
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_generated_paper_item_authoring on public.generated_paper_items
  for all to authenticated
  using (public.has_institution_permission((select p.owner_profile_id from public.generated_papers p where p.id = generated_paper_items.generated_paper_id), 'assessment_authoring'))
  with check (public.has_institution_permission((select p.owner_profile_id from public.generated_papers p where p.id = generated_paper_items.generated_paper_id), 'assessment_authoring'));

-- Session delivery and read-only attempt access.
create policy institution_exam_session_read on public.exam_sessions
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'session_publishing')
    or public.has_institution_permission(owner_profile_id, 'invigilation')
    or public.has_institution_permission(owner_profile_id, 'marking')
    or public.has_institution_permission(owner_profile_id, 'analytics')
  );

create policy institution_exam_session_manage on public.exam_sessions
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'session_publishing'))
  with check (public.has_institution_permission(owner_profile_id, 'session_publishing'));

create policy institution_attempt_read on public.attempts
  for select to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(id), 'student_data'));

create policy institution_attempt_session_read on public.attempt_sessions
  for select to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'student_data'));

create policy institution_attempt_event_read on public.attempt_events
  for select to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'student_data'));

create policy institution_response_read on public.text_responses
  for select to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'student_data'));

create policy institution_upload_slot_read on public.upload_slots
  for select to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'student_data'));

create policy institution_receipt_read on public.submission_receipts
  for select to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'student_data'));

-- Student roster management is intentionally separate from student-data reads.
create policy institution_roster_read on public.student_roster_entries
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'student_data'));

create policy institution_roster_manage on public.student_roster_entries
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'student_management'))
  with check (public.has_institution_permission(owner_profile_id, 'student_management'));

create policy institution_student_link_manage on public.owner_student_links
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'student_management'))
  with check (public.has_institution_permission(owner_profile_id, 'student_management'));

create policy institution_student_profile_read on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.owner_student_links link
      where link.student_profile_id = profiles.id
        and public.has_institution_permission(link.owner_profile_id, 'student_data')
    )
    or exists (
      select 1 from public.student_roster_entries roster
      where roster.student_profile_id = profiles.id
        and public.has_institution_permission(roster.owner_profile_id, 'student_data')
    )
  );

create policy institution_student_group_manage on public.student_groups
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'student_management'))
  with check (public.has_institution_permission(owner_profile_id, 'student_management'));

create policy institution_student_group_member_manage on public.student_group_members
  for all to authenticated
  using (public.has_institution_permission((select g.owner_profile_id from public.student_groups g where g.id = student_group_members.group_id), 'student_management'))
  with check (public.has_institution_permission((select g.owner_profile_id from public.student_groups g where g.id = student_group_members.group_id), 'student_management'));

create policy institution_cohort_manage on public.cohorts
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'student_management'))
  with check (public.has_institution_permission(owner_profile_id, 'student_management'));

create policy institution_cohort_member_manage on public.cohort_members
  for all to authenticated
  using (public.has_institution_permission((select c.owner_profile_id from public.cohorts c where c.id = cohort_members.cohort_id), 'student_management'))
  with check (public.has_institution_permission((select c.owner_profile_id from public.cohorts c where c.id = cohort_members.cohort_id), 'student_management'));

-- Marking and moderation. Marker-owned rows cannot impersonate another marker.
create policy institution_marking_marks on public.marks
  for all to authenticated
  using (
    public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'marking')
    and (marker_profile_id = public.current_profile_id() or public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'moderation'))
  )
  with check (
    public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'marking')
    and (marker_profile_id = public.current_profile_id() or public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'moderation'))
  );

create policy institution_marking_awards on public.rubric_item_awards
  for all to authenticated
  using (
    public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'marking')
    and (marker_profile_id = public.current_profile_id() or public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'moderation'))
  )
  with check (
    public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'marking')
    and (marker_profile_id = public.current_profile_id() or public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'moderation'))
  );

create policy institution_submission_annotation_marking on public.submission_annotations
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'))
  with check (public.has_institution_permission(owner_profile_id, 'marking'));

create policy institution_work_annotation_marking on public.work_annotations
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'))
  with check (public.has_institution_permission(owner_profile_id, 'marking'));

create policy institution_comment_bank_marking on public.comment_bank_items
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'marking'))
  with check (public.has_institution_permission(owner_profile_id, 'marking'));

create policy institution_feedback_release_moderation on public.feedback_releases
  for all to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'moderation'))
  with check (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'moderation'));

create policy institution_marker_assignment_moderation on public.marker_assignments
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'moderation'))
  with check (public.has_institution_permission(owner_profile_id, 'moderation'));

create policy institution_marker_assignment_self_read on public.marker_assignments
  for select to authenticated
  using (marker_profile_id = public.current_profile_id() and public.has_institution_permission(owner_profile_id, 'marking'));

create policy institution_marker_assignment_self_update on public.marker_assignments
  for update to authenticated
  using (marker_profile_id = public.current_profile_id() and public.has_institution_permission(owner_profile_id, 'marking'))
  with check (marker_profile_id = public.current_profile_id() and public.has_institution_permission(owner_profile_id, 'marking'));

-- Invigilation writes are scoped to the owning session; attempt state changes remain RPC/server mediated.
create policy institution_invigilation_messages on public.invigilation_messages
  for all to authenticated
  using (public.has_institution_permission((select s.owner_profile_id from public.exam_sessions s where s.id = invigilation_messages.exam_session_id), 'invigilation'))
  with check (public.has_institution_permission((select s.owner_profile_id from public.exam_sessions s where s.id = invigilation_messages.exam_session_id), 'invigilation'));

create policy institution_live_intervention_manage on public.live_interventions
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'invigilation'))
  with check (public.has_institution_permission(owner_profile_id, 'invigilation'));

create policy institution_incident_manage on public.attempt_incidents
  for all to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'invigilation'))
  with check (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'invigilation'));

create policy institution_accommodation_read on public.attempt_accommodations
  for select to authenticated
  using (public.has_institution_permission(public.owner_profile_id_for_attempt(attempt_id), 'student_data'));

create policy institution_pause_interval_read on public.attempt_pause_intervals
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'invigilation'));

-- Analytics and exports remain owner-scoped. These policies never expose unreleased data to students.
create policy institution_topic_analytics on public.topic_tags
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'analytics'));

create policy institution_mistake_category_analytics on public.mistake_categories
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'analytics'));

create policy institution_marking_packet_export_manage on public.marking_packet_exports
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'exports'))
  with check (public.has_institution_permission(owner_profile_id, 'exports'));

create policy institution_export_manage on public.owner_bulk_operations
  for all to authenticated
  using (operation_type = 'export_receipts' and public.has_institution_permission(owner_profile_id, 'exports'))
  with check (operation_type = 'export_receipts' and public.has_institution_permission(owner_profile_id, 'exports'));

create policy institution_audit_read on public.owner_audit_logs
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'readiness_security'));

comment on function public.has_institution_permission(uuid, text) is
  'Resolves active owner-scoped institution memberships for RLS. Never grants anonymous access and never replaces server-side action checks.';

create or replace function public.audit_institution_action(
  p_owner_profile_id uuid,
  p_action text,
  p_target_table text default null,
  p_target_id uuid default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_id uuid;
  actor_profile_id uuid := public.current_profile_id();
begin
  if actor_profile_id is null then
    raise exception 'Authentication required';
  end if;
  if not (
    (actor_profile_id = p_owner_profile_id and public.is_owner())
    or exists (
      select 1 from public.institution_memberships membership
      where membership.owner_profile_id = p_owner_profile_id
        and membership.member_profile_id = actor_profile_id
        and membership.status = 'active'
    )
  ) then
    raise exception 'Institution membership required';
  end if;
  insert into public.owner_audit_logs (
    owner_profile_id, actor_auth_user_id, action, target_table, target_id, metadata_json
  ) values (
    p_owner_profile_id, auth.uid(), p_action, p_target_table, p_target_id, coalesce(p_metadata_json, '{}'::jsonb)
  ) returning id into audit_id;
  return audit_id;
end;
$$;

revoke all on function public.audit_institution_action(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.audit_institution_action(uuid, text, text, uuid, jsonb) to authenticated, service_role;

create or replace function public.institution_link_guest_attempt(
  p_owner_profile_id uuid,
  p_exam_session_id uuid,
  p_attempt_id uuid,
  p_roster_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  roster_student_profile_id uuid;
begin
  if not public.has_institution_permission(p_owner_profile_id, 'student_management') then
    raise exception 'Student management permission required';
  end if;
  if public.owner_profile_id_for_attempt(p_attempt_id) is distinct from p_owner_profile_id then
    raise exception 'Attempt is outside this institution';
  end if;
  select roster.student_profile_id into roster_student_profile_id
  from public.student_roster_entries roster
  where roster.id = p_roster_entry_id
    and roster.owner_profile_id = p_owner_profile_id;
  if not found then raise exception 'Roster entry not found'; end if;
  update public.attempts
  set roster_entry_id = p_roster_entry_id,
      assignee_profile_id = roster_student_profile_id,
      claim_status = case when roster_student_profile_id is null then 'unclaimed' else 'linked' end,
      identity_review_status = 'resolved',
      updated_at = now()
  where id = p_attempt_id and exam_session_id = p_exam_session_id;
  if not found then raise exception 'Attempt not found in session'; end if;
end;
$$;

create or replace function public.institution_resolve_guest_identity(
  p_owner_profile_id uuid,
  p_exam_session_id uuid,
  p_attempt_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_institution_permission(p_owner_profile_id, 'student_management') then
    raise exception 'Student management permission required';
  end if;
  if public.owner_profile_id_for_attempt(p_attempt_id) is distinct from p_owner_profile_id then
    raise exception 'Attempt is outside this institution';
  end if;
  update public.attempts
  set identity_review_status = 'resolved', updated_at = now()
  where id = p_attempt_id and exam_session_id = p_exam_session_id;
  if not found then raise exception 'Attempt not found in session'; end if;
end;
$$;

create or replace function public.institution_review_attempt_claim(
  p_owner_profile_id uuid,
  p_exam_session_id uuid,
  p_attempt_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attempt public.attempts%rowtype;
  roster_student_profile_id uuid;
begin
  if p_decision not in ('approve', 'reject') then raise exception 'Unsupported claim decision'; end if;
  if not public.has_institution_permission(p_owner_profile_id, 'student_management') then
    raise exception 'Student management permission required';
  end if;
  select * into target_attempt
  from public.attempts
  where id = p_attempt_id
    and exam_session_id = p_exam_session_id
    and claim_status = 'pending'
  for update;
  if not found then raise exception 'Pending claim not found'; end if;
  if public.owner_profile_id_for_attempt(target_attempt.id) is distinct from p_owner_profile_id then
    raise exception 'Attempt is outside this institution';
  end if;

  if p_decision = 'approve' then
    if target_attempt.claim_requested_by_profile_id is null then raise exception 'No student account requested this claim'; end if;
    if target_attempt.roster_entry_id is not null then
      select roster.student_profile_id into roster_student_profile_id
      from public.student_roster_entries roster
      where roster.id = target_attempt.roster_entry_id
        and roster.owner_profile_id = p_owner_profile_id
      for update;
      if not found then raise exception 'Roster entry not found'; end if;
      if roster_student_profile_id is not null and roster_student_profile_id <> target_attempt.claim_requested_by_profile_id then
        raise exception 'Roster entry is already linked to another student account';
      end if;
      update public.student_roster_entries
      set student_profile_id = target_attempt.claim_requested_by_profile_id, updated_at = now()
      where id = target_attempt.roster_entry_id and student_profile_id is null;
    end if;
    update public.attempts
    set assignee_profile_id = target_attempt.claim_requested_by_profile_id,
        claim_status = 'linked',
        claim_reviewed_at = now(),
        claim_reviewed_by_profile_id = public.current_profile_id(),
        identity_review_status = 'resolved',
        updated_at = now()
    where id = target_attempt.id;
  else
    update public.attempts
    set claim_status = 'rejected',
        claim_reviewed_at = now(),
        claim_reviewed_by_profile_id = public.current_profile_id(),
        identity_review_status = 'rejected',
        updated_at = now()
    where id = target_attempt.id;
  end if;
end;
$$;

revoke all on function public.institution_link_guest_attempt(uuid, uuid, uuid, uuid) from public;
revoke all on function public.institution_resolve_guest_identity(uuid, uuid, uuid) from public;
revoke all on function public.institution_review_attempt_claim(uuid, uuid, uuid, text) from public;
grant execute on function public.institution_link_guest_attempt(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.institution_resolve_guest_identity(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.institution_review_attempt_claim(uuid, uuid, uuid, text) to authenticated, service_role;

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
begin
  if not public.has_institution_permission(p_owner_profile_id, 'invigilation') then raise exception 'Invigilation permission required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Rest-break reason is required'; end if;
  if p_maximum_seconds < 60 or p_maximum_seconds > 14400 then raise exception 'Rest break must be between 1 minute and 4 hours'; end if;
  select attempt.* into target_attempt
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.exam_session_id = p_exam_session_id
    and public.owner_profile_id_for_attempt(attempt.id) = p_owner_profile_id
  for update;
  if not found then raise exception 'Attempt not found'; end if;
  if target_attempt.forced_submitted_at is not null or target_attempt.state_cache = 'FINISHED_REVIEW' then raise exception 'Finalized attempts cannot be paused'; end if;
  if target_attempt.paused_at is not null then raise exception 'Attempt is already paused'; end if;
  if now() < target_attempt.start_at_utc or now() >= coalesce(target_attempt.upload_deadline_at_utc, target_attempt.end_at_utc) then
    raise exception 'Attempt is not in a pausable server state';
  end if;
  insert into public.attempt_pause_intervals (attempt_id, exam_session_id, reason, maximum_seconds, owner_profile_id, created_by_profile_id)
  values (target_attempt.id, p_exam_session_id, trim(p_reason), p_maximum_seconds, p_owner_profile_id, actor_profile_id)
  returning * into created_interval;
  update public.attempts set paused_at = created_interval.started_at, state_cache = 'PAUSED', updated_at = now() where id = target_attempt.id;
  return query select created_interval.id, created_interval.started_at;
end;
$$;

create or replace function public.institution_resume_attempt_rest_break(
  p_owner_profile_id uuid,
  p_attempt_id uuid,
  p_exam_session_id uuid
)
returns table(pause_interval_id uuid, applied_seconds integer, new_end_at_utc timestamptz, new_upload_deadline_at_utc timestamptz)
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
  if not public.has_institution_permission(p_owner_profile_id, 'invigilation') then raise exception 'Invigilation permission required'; end if;
  select attempt.* into target_attempt
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.exam_session_id = p_exam_session_id
    and public.owner_profile_id_for_attempt(attempt.id) = p_owner_profile_id
  for update;
  if not found then raise exception 'Attempt not found'; end if;
  select pause.* into open_interval
  from public.attempt_pause_intervals pause
  where pause.attempt_id = target_attempt.id and pause.ended_at is null
  for update;
  if not found or target_attempt.paused_at is null then raise exception 'Attempt is not paused'; end if;
  elapsed_seconds := least(open_interval.maximum_seconds, greatest(0, floor(extract(epoch from (now() - open_interval.started_at)))::integer));
  update public.attempt_pause_intervals
  set ended_at = now(), ended_by_profile_id = actor_profile_id, applied_seconds = elapsed_seconds
  where id = open_interval.id;
  update public.attempts
  set end_at_utc = end_at_utc + make_interval(secs => elapsed_seconds),
      upload_deadline_at_utc = case when upload_deadline_at_utc is null then null else upload_deadline_at_utc + make_interval(secs => elapsed_seconds) end,
      paused_at = null, state_cache = null, updated_at = now()
  where id = target_attempt.id
  returning end_at_utc, upload_deadline_at_utc into target_attempt.end_at_utc, target_attempt.upload_deadline_at_utc;
  return query select open_interval.id, elapsed_seconds, target_attempt.end_at_utc, target_attempt.upload_deadline_at_utc;
end;
$$;

create or replace function public.institution_apply_timing_intervention(
  p_owner_profile_id uuid,
  p_attempt_id uuid,
  p_exam_session_id uuid,
  p_action text,
  p_extra_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attempt public.attempts%rowtype;
  result jsonb;
begin
  if not public.has_institution_permission(p_owner_profile_id, 'invigilation') then raise exception 'Invigilation permission required'; end if;
  if p_action not in ('extra_time', 'force_submit') then raise exception 'Unsupported timing intervention'; end if;
  select attempt.* into target_attempt
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.exam_session_id = p_exam_session_id
    and public.owner_profile_id_for_attempt(attempt.id) = p_owner_profile_id
  for update;
  if not found then raise exception 'Attempt not found'; end if;
  if target_attempt.forced_submitted_at is not null or target_attempt.state_cache = 'FINISHED_REVIEW' then raise exception 'Finalized attempts cannot receive interventions'; end if;
  if p_action = 'extra_time' then
    if p_extra_seconds is null or p_extra_seconds < 60 or p_extra_seconds > 7200 then raise exception 'Extra time must be between 1 and 120 minutes'; end if;
    if now() >= coalesce(target_attempt.upload_deadline_at_utc, target_attempt.end_at_utc) then raise exception 'Attempt timing window has finished'; end if;
    update public.attempts
    set end_at_utc = end_at_utc + make_interval(secs => p_extra_seconds),
        upload_deadline_at_utc = case when upload_deadline_at_utc is null then null else upload_deadline_at_utc + make_interval(secs => p_extra_seconds) end,
        state_cache = null,
        updated_at = now()
    where id = target_attempt.id
    returning jsonb_build_object(
      'extra_seconds', p_extra_seconds,
      'previous_end_at_utc', target_attempt.end_at_utc,
      'new_end_at_utc', end_at_utc,
      'previous_upload_deadline_at_utc', target_attempt.upload_deadline_at_utc,
      'new_upload_deadline_at_utc', upload_deadline_at_utc
    ) into result;
  else
    if now() < target_attempt.start_at_utc then raise exception 'Attempt has not started'; end if;
    update public.attempts set forced_submitted_at = now(), paused_at = null, state_cache = 'FINISHED_REVIEW', updated_at = now()
    where id = target_attempt.id
    returning jsonb_build_object('forced_submitted_at', forced_submitted_at) into result;
  end if;
  return result;
end;
$$;

revoke all on function public.institution_start_attempt_rest_break(uuid, uuid, uuid, text, integer) from public;
revoke all on function public.institution_resume_attempt_rest_break(uuid, uuid, uuid) from public;
revoke all on function public.institution_apply_timing_intervention(uuid, uuid, uuid, text, integer) from public;
grant execute on function public.institution_start_attempt_rest_break(uuid, uuid, uuid, text, integer) to authenticated, service_role;
grant execute on function public.institution_resume_attempt_rest_break(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.institution_apply_timing_intervention(uuid, uuid, uuid, text, integer) to authenticated, service_role;
