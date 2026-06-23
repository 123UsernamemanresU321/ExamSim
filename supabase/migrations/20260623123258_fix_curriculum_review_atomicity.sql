-- Recover safely from imported owner-scoped paths that predate the canonical
-- /resources/ and /curriculum/ segments, and make guide review atomic.

create or replace function public.validate_resource_library_owner_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  replaced_owner_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.owner_profile_id <> old.owner_profile_id
    or new.created_by_profile_id <> old.created_by_profile_id
    or new.object_path <> old.object_path
    or new.sha256 <> old.sha256
  ) then
    raise exception 'Resource ownership and upload provenance are immutable';
  end if;

  if tg_op = 'UPDATE' and new.object_path = old.object_path then
    if not (
      new.object_path like new.owner_profile_id::text || '/%'
      and position('..' in new.object_path) = 0
      and right(lower(new.object_path), 4) = '.pdf'
    ) then
      raise exception 'Resource object path is outside its owner scope';
    end if;
  elsif not (
    new.object_path like new.owner_profile_id::text || '/resources/%'
    and position('..' in new.object_path) = 0
    and right(lower(new.object_path), 4) = '.pdf'
  ) then
    raise exception 'Resource object path is outside its canonical owner scope';
  end if;

  if new.replaces_resource_id is not null then
    select resource.owner_profile_id
      into replaced_owner_id
    from public.resource_library_items resource
    where resource.id = new.replaces_resource_id;
    if replaced_owner_id is null or replaced_owner_id <> new.owner_profile_id then
      raise exception 'Replacement resource belongs to another owner';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_resource_library_owner_scope() from public, anon, authenticated;

create or replace function public.validate_curriculum_source_owner_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  framework_owner_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.owner_profile_id <> old.owner_profile_id
    or new.created_by_profile_id <> old.created_by_profile_id
    or new.object_path <> old.object_path
    or new.sha256 <> old.sha256
  ) then
    raise exception 'Curriculum source ownership and upload provenance are immutable';
  end if;

  if tg_op = 'UPDATE' and new.object_path = old.object_path then
    if not (
      new.object_path like new.owner_profile_id::text || '/%'
      and position('..' in new.object_path) = 0
      and right(lower(new.object_path), 4) = '.pdf'
    ) then
      raise exception 'Curriculum source path is outside its owner scope';
    end if;
  elsif not (
    new.object_path like new.owner_profile_id::text || '/curriculum/%'
    and position('..' in new.object_path) = 0
    and right(lower(new.object_path), 4) = '.pdf'
  ) then
    raise exception 'Curriculum source path is outside its canonical owner scope';
  end if;

  if new.framework_id is not null then
    select framework.owner_profile_id
      into framework_owner_id
    from public.curriculum_frameworks framework
    where framework.id = new.framework_id;
    if framework_owner_id is null or framework_owner_id <> new.owner_profile_id then
      raise exception 'Curriculum framework belongs to another owner';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_curriculum_source_owner_scope() from public, anon, authenticated;

create or replace function public.institution_review_curriculum_standards(
  p_owner_profile_id uuid,
  p_standard_ids uuid[],
  p_decision text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id uuid;
  requested_count integer;
  matched_count integer;
  changed_count integer;
begin
  if p_owner_profile_id is null or p_standard_ids is null or cardinality(p_standard_ids) = 0 then
    raise exception 'Owner and at least one curriculum standard are required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Curriculum review decision must be approved or rejected';
  end if;
  if not public.has_institution_permission(p_owner_profile_id, 'assessment_authoring') then
    raise exception 'Institution assessment authoring permission required';
  end if;

  actor_profile_id := public.current_profile_id();
  if actor_profile_id is null then
    raise exception 'Authenticated profile required';
  end if;

  select count(distinct standard_id)
    into requested_count
  from unnest(p_standard_ids) as requested(standard_id)
  where standard_id is not null;
  if requested_count <> cardinality(p_standard_ids) then
    raise exception 'Curriculum review selection contains duplicate or invalid identifiers';
  end if;

  perform 1
  from public.curriculum_standards standard
  where standard.id = any(p_standard_ids)
    and standard.owner_profile_id = p_owner_profile_id
    and standard.review_status in ('draft', 'reviewed', p_decision)
  for update;

  select count(*)
    into matched_count
  from public.curriculum_standards standard
  where standard.id = any(p_standard_ids)
    and standard.owner_profile_id = p_owner_profile_id
    and standard.review_status in ('draft', 'reviewed', p_decision);
  if matched_count <> requested_count then
    raise exception 'One or more curriculum nodes cannot be reviewed in this workspace';
  end if;

  update public.curriculum_standards standard
  set review_status = p_decision,
      reviewed_by_profile_id = actor_profile_id,
      reviewed_at = now(),
      updated_at = now()
  where standard.id = any(p_standard_ids)
    and standard.owner_profile_id = p_owner_profile_id
    and standard.review_status in ('draft', 'reviewed');
  get diagnostics changed_count = row_count;

  update public.curriculum_source_documents source
  set status = 'ready',
      reviewed_by_profile_id = actor_profile_id,
      reviewed_at = coalesce(source.reviewed_at, now()),
      updated_at = now()
  where source.owner_profile_id = p_owner_profile_id
    and source.id in (
      select distinct standard.source_document_id
      from public.curriculum_standards standard
      where standard.id = any(p_standard_ids)
        and standard.owner_profile_id = p_owner_profile_id
        and standard.source_document_id is not null
    )
    and not exists (
      select 1
      from public.curriculum_standards pending
      where pending.source_document_id = source.id
        and pending.owner_profile_id = p_owner_profile_id
        and pending.review_status in ('draft', 'reviewed')
    );

  return changed_count;
end;
$$;

revoke all on function public.institution_review_curriculum_standards(uuid, uuid[], text) from public, anon;
grant execute on function public.institution_review_curriculum_standards(uuid, uuid[], text) to authenticated, service_role;

comment on function public.institution_review_curriculum_standards(uuid, uuid[], text) is
  'Atomically applies an owner-scoped curriculum review decision and finalizes source documents when their review queue is empty. Repeating the same decision is idempotent.';

-- Reconcile source rows left behind by the former multi-call Server Action.
-- This is safe only when the source has at least one reviewed node and no
-- draft/reviewed nodes remaining.
update public.curriculum_source_documents source
set status = 'ready',
    reviewed_by_profile_id = coalesce(
      source.reviewed_by_profile_id,
      (
        select reviewed.reviewed_by_profile_id
        from public.curriculum_standards reviewed
        where reviewed.source_document_id = source.id
          and reviewed.owner_profile_id = source.owner_profile_id
          and reviewed.reviewed_by_profile_id is not null
        order by reviewed.reviewed_at desc nulls last
        limit 1
      )
    ),
    reviewed_at = coalesce(source.reviewed_at, now()),
    updated_at = now()
where source.status = 'needs_review'
  and exists (
    select 1
    from public.curriculum_standards reviewed
    where reviewed.source_document_id = source.id
      and reviewed.owner_profile_id = source.owner_profile_id
      and reviewed.review_status in ('approved', 'rejected')
  )
  and not exists (
    select 1
    from public.curriculum_standards pending
    where pending.source_document_id = source.id
      and pending.owner_profile_id = source.owner_profile_id
      and pending.review_status in ('draft', 'reviewed')
  );
