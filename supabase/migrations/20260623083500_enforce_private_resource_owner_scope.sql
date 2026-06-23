-- Prevent cross-workspace private object signing through forged resource,
-- material, or curriculum references. Edge code also checks these boundaries,
-- but database triggers keep direct authenticated writes and service workflows
-- from creating unsafe relationships.

create or replace function public.validate_resource_library_owner_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  replaced_owner_id uuid;
begin
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
drop trigger if exists resource_library_owner_scope on public.resource_library_items;
create trigger resource_library_owner_scope
  before insert or update on public.resource_library_items
  for each row execute function public.validate_resource_library_owner_scope();

create or replace function public.validate_assessment_material_resource_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assessment_owner_id uuid;
  resource_owner_id uuid;
  resource_status text;
begin
  select assessment.owner_profile_id
    into assessment_owner_id
  from public.assessments assessment
  join public.assessment_versions version on version.assessment_id = assessment.id
  where assessment.id = new.assessment_id
    and version.id = new.assessment_version_id;
  if assessment_owner_id is null then
    raise exception 'Assessment material does not match its assessment version';
  end if;

  if new.resource_library_item_id is not null then
    select resource.owner_profile_id, resource.status
      into resource_owner_id, resource_status
    from public.resource_library_items resource
    where resource.id = new.resource_library_item_id;
    if resource_owner_id is null or resource_owner_id <> assessment_owner_id then
      raise exception 'Assessment resource belongs to another owner';
    end if;
    if resource_status <> 'active' then
      raise exception 'Assessment resource must be active';
    end if;
  elsif new.object_path is not null and (
    new.object_path not like assessment_owner_id::text || '/%'
    or position('..' in new.object_path) > 0
  ) then
    raise exception 'Legacy assessment material path is outside its owner scope';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_assessment_material_resource_scope() from public, anon, authenticated;
drop trigger if exists assessment_material_resource_owner_scope on public.assessment_materials;
create trigger assessment_material_resource_owner_scope
  before insert or update on public.assessment_materials
  for each row execute function public.validate_assessment_material_resource_scope();

create or replace function public.validate_curriculum_source_owner_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  framework_owner_id uuid;
begin
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
drop trigger if exists curriculum_source_owner_scope on public.curriculum_source_documents;
create trigger curriculum_source_owner_scope
  before insert or update on public.curriculum_source_documents
  for each row execute function public.validate_curriculum_source_owner_scope();

create or replace function public.validate_curriculum_standard_source_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_owner_id uuid;
begin
  if new.source_document_id is not null then
    select source.owner_profile_id
      into source_owner_id
    from public.curriculum_source_documents source
    where source.id = new.source_document_id;
    if source_owner_id is null or source_owner_id <> new.owner_profile_id then
      raise exception 'Curriculum source belongs to another owner';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_curriculum_standard_source_scope() from public, anon, authenticated;
drop trigger if exists curriculum_standard_source_owner_scope on public.curriculum_standards;
create trigger curriculum_standard_source_owner_scope
  before insert or update on public.curriculum_standards
  for each row execute function public.validate_curriculum_standard_source_scope();

