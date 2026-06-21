-- Owner-scoped curriculum frameworks, hierarchical standards, and authoring links.

create table if not exists public.curriculum_frameworks (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  name text not null,
  version text not null default 'custom',
  description text null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_profile_id, code, version)
);

create table if not exists public.curriculum_standards (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  framework_id uuid not null references public.curriculum_frameworks(id) on delete cascade,
  parent_standard_id uuid null references public.curriculum_standards(id) on delete cascade,
  code text not null,
  title text not null,
  description text null,
  subject text null,
  level text null,
  sort_order integer not null default 0,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework_id, code)
);

create table if not exists public.question_standard_links (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  curriculum_standard_id uuid not null references public.curriculum_standards(id) on delete cascade,
  weight numeric not null default 1 check (weight > 0 and weight <= 10),
  created_at timestamptz not null default now(),
  unique (question_node_id, curriculum_standard_id)
);

create table if not exists public.rubric_standard_links (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  rubric_template_item_id uuid not null references public.rubric_template_items(id) on delete cascade,
  curriculum_standard_id uuid not null references public.curriculum_standards(id) on delete cascade,
  weight numeric not null default 1 check (weight > 0 and weight <= 10),
  created_at timestamptz not null default now(),
  unique (rubric_template_item_id, curriculum_standard_id)
);

create index if not exists curriculum_standards_tree_idx
  on public.curriculum_standards(owner_profile_id, framework_id, parent_standard_id, sort_order, code);
create index if not exists question_standard_links_question_idx
  on public.question_standard_links(question_node_id);
create index if not exists rubric_standard_links_item_idx
  on public.rubric_standard_links(rubric_template_item_id);

alter table public.curriculum_frameworks enable row level security;
alter table public.curriculum_standards enable row level security;
alter table public.question_standard_links enable row level security;
alter table public.rubric_standard_links enable row level security;

grant select, insert, update, delete on public.curriculum_frameworks to authenticated;
grant select, insert, update, delete on public.curriculum_standards to authenticated;
grant select, insert, update, delete on public.question_standard_links to authenticated;
grant select, insert, update, delete on public.rubric_standard_links to authenticated;

create policy institution_curriculum_framework_read on public.curriculum_frameworks
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    or public.has_institution_permission(owner_profile_id, 'analytics')
  );
create policy institution_curriculum_framework_insert on public.curriculum_frameworks
  for insert to authenticated
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring') and created_by_profile_id = public.current_profile_id());
create policy institution_curriculum_framework_update on public.curriculum_frameworks
  for update to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));
create policy institution_curriculum_framework_delete on public.curriculum_frameworks
  for delete to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));

create policy institution_curriculum_standard_read on public.curriculum_standards
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    or public.has_institution_permission(owner_profile_id, 'analytics')
  );
create policy institution_curriculum_standard_manage on public.curriculum_standards
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and exists (
      select 1 from public.curriculum_frameworks framework
      where framework.id = curriculum_standards.framework_id
        and framework.owner_profile_id = curriculum_standards.owner_profile_id
    )
  );

create policy institution_question_standard_read on public.question_standard_links
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    or public.has_institution_permission(owner_profile_id, 'analytics')
  );
create policy institution_question_standard_manage on public.question_standard_links
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and exists (
      select 1
      from public.question_nodes question
      join public.assessment_versions version on version.id = question.assessment_version_id
      join public.assessments assessment on assessment.id = version.assessment_id
      where question.id = question_standard_links.question_node_id
        and assessment.owner_profile_id = question_standard_links.owner_profile_id
        and version.status <> 'published'
    )
    and exists (
      select 1 from public.curriculum_standards standard
      where standard.id = question_standard_links.curriculum_standard_id
        and standard.owner_profile_id = question_standard_links.owner_profile_id
    )
  );

create policy institution_rubric_standard_read on public.rubric_standard_links
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    or public.has_institution_permission(owner_profile_id, 'analytics')
    or public.has_institution_permission(owner_profile_id, 'marking')
  );
create policy institution_rubric_standard_manage on public.rubric_standard_links
  for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring'))
  with check (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    and exists (
      select 1
      from public.rubric_template_items item
      join public.rubric_templates template on template.id = item.rubric_template_id
      where item.id = rubric_standard_links.rubric_template_item_id
        and template.owner_profile_id = rubric_standard_links.owner_profile_id
    )
    and exists (
      select 1 from public.curriculum_standards standard
      where standard.id = rubric_standard_links.curriculum_standard_id
        and standard.owner_profile_id = rubric_standard_links.owner_profile_id
    )
  );

comment on table public.curriculum_frameworks is 'Owner-imported curriculum/version containers. Sample rows are not a claim of complete official coverage.';
comment on table public.curriculum_standards is 'Hierarchical owner-managed standards used by authoring, analytics, and revision workflows.';
