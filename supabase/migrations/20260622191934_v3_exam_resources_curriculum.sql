-- Reusable private resources, immutable assessment policies, and reviewed
-- curriculum-source provenance for the V3 release boundary.

create table if not exists public.resource_library_items (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  material_type text not null check (material_type in ('formula_booklet', 'data_booklet', 'annex', 'instructions', 'reference', 'other')),
  subject text null,
  level text null,
  version_label text null,
  language_code text not null default 'en',
  object_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  page_count integer null check (page_count is null or (page_count > 0 and page_count <= 2000)),
  content_type text not null default 'application/pdf' check (content_type = 'application/pdf'),
  status text not null default 'active' check (status in ('active', 'archived', 'replaced')),
  replaces_resource_id uuid null references public.resource_library_items(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_profile_id, sha256)
);

alter table public.assessment_materials
  add column if not exists resource_library_item_id uuid null references public.resource_library_items(id) on delete restrict,
  add column if not exists requirement text not null default 'allowed' check (requirement in ('allowed', 'required')),
  add column if not exists sort_order integer not null default 0;

create unique index if not exists assessment_materials_version_resource_uidx
  on public.assessment_materials(assessment_version_id, resource_library_item_id)
  where resource_library_item_id is not null;

create table if not exists public.assessment_tool_policies (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  tool_code text not null check (tool_code in ('physical_calculator', 'physical_materials', 'tts', 'desmos', 'geogebra', 'chemistry_editor')),
  requirement text not null check (requirement in ('prohibited', 'allowed', 'required')),
  configuration_json jsonb not null default '{}',
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_version_id, tool_code)
);

alter table public.attempts
  add column if not exists exam_policy_json jsonb not null default '{"assessmentVersionId":null,"capturedAt":null,"resources":[],"tools":[],"allowedMaterials":[]}'::jsonb;

create table if not exists public.curriculum_source_documents (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  framework_id uuid null references public.curriculum_frameworks(id) on delete set null,
  title text not null check (char_length(title) between 1 and 220),
  subject text null,
  programme_component text not null default 'subject' check (programme_component in ('subject', 'core')),
  version_label text null,
  language_code text not null default 'en',
  object_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  page_count integer null check (page_count is null or (page_count > 0 and page_count <= 2000)),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'needs_review', 'ready', 'failed', 'archived')),
  error_message text null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  reviewed_by_profile_id uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_profile_id, sha256)
);

create table if not exists public.curriculum_import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  source_document_id uuid not null references public.curriculum_source_documents(id) on delete cascade,
  provider text not null default 'deterministic',
  status text not null default 'queued' check (status in ('not_configured', 'queued', 'processing', 'failed', 'needs_review', 'completed', 'retried')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  retry_count integer not null default 0 check (retry_count between 0 and 20),
  error_message text null,
  result_summary_json jsonb not null default '{}',
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.curriculum_frameworks
  add column if not exists review_status text not null default 'draft' check (review_status in ('draft', 'reviewed', 'active', 'archived')),
  add column if not exists source_document_id uuid null references public.curriculum_source_documents(id) on delete set null,
  add column if not exists approved_by_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz null;

alter table public.curriculum_standards
  add column if not exists standard_kind text not null default 'topic' check (standard_kind in ('topic', 'subtopic', 'skill', 'assessment_objective', 'command_term', 'core_requirement')),
  add column if not exists source_document_id uuid null references public.curriculum_source_documents(id) on delete set null,
  add column if not exists source_page_start integer null check (source_page_start is null or source_page_start > 0),
  add column if not exists source_page_end integer null check (source_page_end is null or source_page_end > 0),
  add column if not exists review_status text not null default 'draft' check (review_status in ('draft', 'reviewed', 'approved', 'rejected')),
  add column if not exists reviewed_by_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz null,
  add constraint curriculum_standard_source_page_order_check
    check (source_page_end is null or source_page_start is null or source_page_end >= source_page_start);

create index if not exists resource_library_owner_status_idx
  on public.resource_library_items(owner_profile_id, status, material_type, subject);
create index if not exists assessment_tool_policy_owner_version_idx
  on public.assessment_tool_policies(owner_profile_id, assessment_version_id, tool_code);
create index if not exists curriculum_source_owner_status_idx
  on public.curriculum_source_documents(owner_profile_id, status, subject);
create index if not exists curriculum_import_job_owner_status_idx
  on public.curriculum_import_jobs(owner_profile_id, status, created_at desc);

alter table public.resource_library_items enable row level security;
alter table public.assessment_tool_policies enable row level security;
alter table public.curriculum_source_documents enable row level security;
alter table public.curriculum_import_jobs enable row level security;

grant select, insert, update, delete on public.resource_library_items to authenticated;
grant select, insert, update, delete on public.assessment_tool_policies to authenticated;
grant select, insert, update, delete on public.curriculum_source_documents to authenticated;
grant select, insert, update, delete on public.curriculum_import_jobs to authenticated;

create policy institution_resource_library_read on public.resource_library_items
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    or public.has_institution_permission(owner_profile_id, 'session_publishing')
  );
create policy institution_resource_library_manage on public.resource_library_items
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and created_by_profile_id = public.current_profile_id()
  );

create policy institution_assessment_tool_policy_read on public.assessment_tool_policies
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    or public.has_institution_permission(owner_profile_id, 'session_publishing')
    or public.has_institution_permission(owner_profile_id, 'invigilation')
  );
create policy institution_assessment_tool_policy_manage on public.assessment_tool_policies
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and created_by_profile_id = public.current_profile_id()
    and exists (
      select 1
      from public.assessments assessment
      join public.assessment_versions version on version.assessment_id = assessment.id
      where assessment.id = assessment_tool_policies.assessment_id
        and version.id = assessment_tool_policies.assessment_version_id
        and assessment.owner_profile_id = assessment_tool_policies.owner_profile_id
        and version.status <> 'published'
    )
  );

create policy institution_curriculum_source_read on public.curriculum_source_documents
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    or public.has_institution_permission(owner_profile_id, 'analytics')
  );
create policy institution_curriculum_source_manage on public.curriculum_source_documents
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and created_by_profile_id = public.current_profile_id()
  );

create policy institution_curriculum_import_job_read on public.curriculum_import_jobs
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));
create policy institution_curriculum_import_job_manage on public.curriculum_import_jobs
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and created_by_profile_id = public.current_profile_id()
  );

drop policy if exists "owner manages assessment materials" on public.assessment_materials;
drop policy if exists "students read allowed assessment materials" on public.assessment_materials;
drop policy if exists institution_assessment_material_read on public.assessment_materials;
drop policy if exists institution_assessment_material_manage on public.assessment_materials;
create policy institution_assessment_material_read on public.assessment_materials
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessments assessment
      where assessment.id = assessment_materials.assessment_id
        and (
          public.has_institution_permission(assessment.owner_profile_id, 'assessment_authoring')
          or public.has_institution_permission(assessment.owner_profile_id, 'session_publishing')
        )
    )
  );
create policy institution_assessment_material_manage on public.assessment_materials
  for all to authenticated
  using (
    exists (
      select 1 from public.assessments assessment
      where assessment.id = assessment_materials.assessment_id
        and public.has_institution_permission(assessment.owner_profile_id, 'assessment_authoring')
    )
  )
  with check (
    exists (
      select 1
      from public.assessments assessment
      join public.assessment_versions version on version.assessment_id = assessment.id
      where assessment.id = assessment_materials.assessment_id
        and version.id = assessment_materials.assessment_version_id
        and version.status <> 'published'
        and public.has_institution_permission(assessment.owner_profile_id, 'assessment_authoring')
    )
  );

create or replace function public.prevent_published_exam_policy_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_version_id uuid;
  published_version boolean;
begin
  target_version_id := case when tg_op = 'DELETE' then old.assessment_version_id else new.assessment_version_id end;
  select (version.status = 'published' or version.governance_status = 'published')
  into published_version
  from public.assessment_versions version
  where version.id = target_version_id;

  if coalesce(published_version, false) then
    raise exception 'Published assessment policy is immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_materials_policy_immutable on public.assessment_materials;
create trigger assessment_materials_policy_immutable
  before insert or update or delete on public.assessment_materials
  for each row execute function public.prevent_published_exam_policy_mutation();

drop trigger if exists assessment_tool_policies_immutable on public.assessment_tool_policies;
create trigger assessment_tool_policies_immutable
  before insert or update or delete on public.assessment_tool_policies
  for each row execute function public.prevent_published_exam_policy_mutation();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('assessment-resources', 'assessment-resources', false, 52428800, array['application/pdf']::text[]),
  ('curriculum-sources', 'curriculum-sources', false, 52428800, array['application/pdf']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists institution_assessment_resource_storage on storage.objects;
create policy institution_assessment_resource_storage on storage.objects
  for all to authenticated
  using (
    bucket_id = 'assessment-resources'
    and public.has_institution_permission(public.storage_owner_profile_id(name), 'assessment_authoring')
  )
  with check (
    bucket_id = 'assessment-resources'
    and public.has_institution_permission(public.storage_owner_profile_id(name), 'assessment_authoring')
  );

drop policy if exists institution_curriculum_source_storage on storage.objects;
create policy institution_curriculum_source_storage on storage.objects
  for all to authenticated
  using (
    bucket_id = 'curriculum-sources'
    and public.has_institution_permission(public.storage_owner_profile_id(name), 'assessment_authoring')
  )
  with check (
    bucket_id = 'curriculum-sources'
    and public.has_institution_permission(public.storage_owner_profile_id(name), 'assessment_authoring')
  );

comment on table public.resource_library_items is
  'Owner-scoped immutable PDF resource versions. Objects remain private and are released only through checked signed-URL boundaries.';
comment on table public.curriculum_source_documents is
  'Private licensed guide provenance for owner-reviewed curriculum imports; source PDFs are never student-visible.';
comment on column public.attempts.exam_policy_json is
  'Frozen assessment resource/tool policy captured when the attempt is created.';

-- Extend the existing version-clone boundary without weakening its ownership
-- checks. This keeps published resource/tool policy frozen while carrying it
-- into a separately editable draft.
alter function public.clone_assessment_version_as_draft(uuid)
  rename to clone_assessment_version_content_as_draft;

revoke all on function public.clone_assessment_version_content_as_draft(uuid) from public;
revoke all on function public.clone_assessment_version_content_as_draft(uuid) from anon;
revoke all on function public.clone_assessment_version_content_as_draft(uuid) from authenticated;

create or replace function public.clone_assessment_version_as_draft(p_source_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_version_id uuid;
begin
  new_version_id := public.clone_assessment_version_content_as_draft(p_source_version_id);

  insert into public.assessment_materials (
    assessment_id, assessment_version_id, resource_library_item_id, title,
    material_type, object_path, content_html, visibility_policy, requirement,
    sort_order, created_at
  )
  select material.assessment_id, new_version_id, material.resource_library_item_id,
    material.title, material.material_type, material.object_path,
    material.content_html, material.visibility_policy, material.requirement,
    material.sort_order, now()
  from public.assessment_materials material
  where material.assessment_version_id = p_source_version_id;

  insert into public.assessment_tool_policies (
    owner_profile_id, assessment_id, assessment_version_id, tool_code,
    requirement, configuration_json, created_by_profile_id, created_at, updated_at
  )
  select policy.owner_profile_id, policy.assessment_id, new_version_id,
    policy.tool_code, policy.requirement, policy.configuration_json,
    public.current_profile_id(), now(), now()
  from public.assessment_tool_policies policy
  where policy.assessment_version_id = p_source_version_id;

  return new_version_id;
end;
$$;

revoke all on function public.clone_assessment_version_as_draft(uuid) from public;
revoke all on function public.clone_assessment_version_as_draft(uuid) from anon;
grant execute on function public.clone_assessment_version_as_draft(uuid) to authenticated;
