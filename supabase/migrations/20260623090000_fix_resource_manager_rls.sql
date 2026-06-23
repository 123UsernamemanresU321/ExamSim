-- Keep resource provenance immutable while allowing any authorized assessment
-- author in the owner workspace to archive or replace an existing item.

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

  if new.object_path not like new.owner_profile_id::text || '/resources/%'
    or position('..' in new.object_path) > 0
    or right(new.object_path, 4) <> '.pdf' then
    raise exception 'Resource object path is outside its owner scope';
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

drop policy if exists institution_resource_library_manage on public.resource_library_items;
drop policy if exists institution_resource_library_insert on public.resource_library_items;
drop policy if exists institution_resource_library_update on public.resource_library_items;
drop policy if exists institution_resource_library_delete on public.resource_library_items;

create policy institution_resource_library_insert on public.resource_library_items
  for insert to authenticated
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and created_by_profile_id = public.current_profile_id()
  );

create policy institution_resource_library_update on public.resource_library_items
  for update to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_resource_library_delete on public.resource_library_items
  for delete to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

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

  if new.object_path not like new.owner_profile_id::text || '/curriculum/%'
    or position('..' in new.object_path) > 0
    or right(new.object_path, 4) <> '.pdf' then
    raise exception 'Curriculum source path is outside its owner scope';
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

drop policy if exists institution_curriculum_source_manage on public.curriculum_source_documents;
drop policy if exists institution_curriculum_source_insert on public.curriculum_source_documents;
drop policy if exists institution_curriculum_source_update on public.curriculum_source_documents;
drop policy if exists institution_curriculum_source_delete on public.curriculum_source_documents;

create policy institution_curriculum_source_insert on public.curriculum_source_documents
  for insert to authenticated
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and created_by_profile_id = public.current_profile_id()
  );

create policy institution_curriculum_source_update on public.curriculum_source_documents
  for update to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_curriculum_source_delete on public.curriculum_source_documents
  for delete to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));
