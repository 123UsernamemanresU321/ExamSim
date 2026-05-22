-- Exam Vault advanced development package.
-- Adds paper health checks, mistake taxonomy, question bank extraction,
-- generated paper drafts, and student correction notebooks.

create extension if not exists pgcrypto;

create table if not exists public.assessment_health_checks (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid null references public.assessment_versions(id) on delete cascade,
  status text not null check (status in ('ready', 'warning', 'blocked', 'not_checked')) default 'not_checked',
  score integer not null default 0 check (score >= 0 and score <= 100),
  blockers_json jsonb not null default '[]',
  warnings_json jsonb not null default '[]',
  checks_json jsonb not null default '{}',
  last_checked_at timestamptz not null default now(),
  overridden_by_profile_id uuid null references public.profiles(id) on delete set null,
  override_reason text null,
  created_at timestamptz not null default now()
);

create table if not exists public.mistake_categories (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text null,
  color text null,
  parent_category_id uuid null references public.mistake_categories(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, name)
);

create table if not exists public.mistake_instances (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  category_id uuid not null references public.mistake_categories(id) on delete restrict,
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  severity text not null check (severity in ('minor', 'moderate', 'major')) default 'moderate',
  note text null,
  linked_mark_delta numeric null,
  student_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  source_assessment_id uuid null references public.assessments(id) on delete set null,
  source_assessment_version_id uuid null references public.assessment_versions(id) on delete set null,
  source_question_node_id uuid null references public.question_nodes(id) on delete set null,
  title text null,
  root_node_key text not null,
  prompt_html text null,
  prompt_latex text null,
  source_pdf_object_path text null,
  source_page_start integer null,
  source_page_end integer null,
  source_region_json jsonb null,
  marks_available numeric null,
  estimated_difficulty integer null check (estimated_difficulty is null or (estimated_difficulty >= 1 and estimated_difficulty <= 5)),
  assessment_kind text null check (assessment_kind is null or assessment_kind in ('practice_paper', 'quiz', 'test', 'exam')),
  subject text null,
  paper_code text null,
  tags text[] not null default '{}',
  topic_tag_ids uuid[] not null default '{}',
  has_visual_assets boolean not null default false,
  visual_asset_refs jsonb not null default '[]',
  answer_mode text not null default 'upload_pdf' check (answer_mode in ('none', 'upload_pdf', 'typed_text', 'typed_or_upload', 'multiple_choice', 'numerical')),
  markscheme_html text null,
  markscheme_refs jsonb not null default '[]',
  do_not_reuse boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank_children (
  id uuid primary key default gen_random_uuid(),
  question_bank_item_id uuid not null references public.question_bank_items(id) on delete cascade,
  node_key text not null,
  parent_node_key text null,
  ordinal_path integer[] not null,
  prompt_html text null,
  marks_available numeric null,
  markscheme_html text null,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_papers (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject text null,
  target_marks numeric null,
  target_duration_seconds integer null,
  criteria_json jsonb not null default '{}',
  status text not null check (status in ('draft', 'converted_to_assessment', 'discarded')) default 'draft',
  converted_assessment_id uuid null references public.assessments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_paper_items (
  id uuid primary key default gen_random_uuid(),
  generated_paper_id uuid not null references public.generated_papers(id) on delete cascade,
  question_bank_item_id uuid not null references public.question_bank_items(id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  included_marks numeric null,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique(generated_paper_id, question_bank_item_id)
);

create table if not exists public.correction_notebooks (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid unique not null references public.attempts(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('not_started', 'in_progress', 'submitted', 'reviewed')) default 'not_started',
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.correction_entries (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.correction_notebooks(id) on delete cascade,
  question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  root_question_node_id uuid not null references public.question_nodes(id) on delete cascade,
  correction_text text null,
  reflection_text text null,
  corrected_upload_object_path text null,
  confidence_after_correction integer null check (confidence_after_correction is null or (confidence_after_correction >= 1 and confidence_after_correction <= 5)),
  status text not null check (status in ('draft', 'submitted', 'reviewed')) default 'draft',
  owner_feedback text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notebook_id, question_node_id)
);

create index if not exists assessment_health_checks_assessment_idx on public.assessment_health_checks(assessment_id, last_checked_at desc);
create index if not exists mistake_categories_owner_idx on public.mistake_categories(owner_profile_id, name);
create index if not exists mistake_instances_attempt_question_idx on public.mistake_instances(attempt_id, question_node_id);
create index if not exists question_bank_items_owner_search_idx on public.question_bank_items(owner_profile_id, subject, paper_code, created_at desc);
create index if not exists question_bank_items_tags_idx on public.question_bank_items using gin(tags);
create index if not exists question_bank_children_item_idx on public.question_bank_children(question_bank_item_id, ordinal_path);
create index if not exists generated_papers_owner_idx on public.generated_papers(owner_profile_id, status, created_at desc);
create index if not exists generated_paper_items_paper_idx on public.generated_paper_items(generated_paper_id, ordinal);
create index if not exists correction_notebooks_attempt_idx on public.correction_notebooks(attempt_id);
create index if not exists correction_notebooks_student_idx on public.correction_notebooks(student_profile_id, status, updated_at desc);
create index if not exists correction_entries_notebook_idx on public.correction_entries(notebook_id, status);

alter table public.assessment_health_checks enable row level security;
alter table public.mistake_categories enable row level security;
alter table public.mistake_instances enable row level security;
alter table public.question_bank_items enable row level security;
alter table public.question_bank_children enable row level security;
alter table public.generated_papers enable row level security;
alter table public.generated_paper_items enable row level security;
alter table public.correction_notebooks enable row level security;
alter table public.correction_entries enable row level security;

drop policy if exists "owner manages assessment health checks" on public.assessment_health_checks;
create policy "owner manages assessment health checks" on public.assessment_health_checks for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner manages mistake categories" on public.mistake_categories;
create policy "owner manages mistake categories" on public.mistake_categories for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner manages mistake instances" on public.mistake_instances;
create policy "owner manages mistake instances" on public.mistake_instances for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "student reads released visible mistake instances" on public.mistake_instances;
create policy "student reads released visible mistake instances" on public.mistake_instances for select to authenticated using (
  student_visible
  and exists (
    select 1
    from public.attempts a
    join public.feedback_releases fr on fr.attempt_id = a.id
    where a.id = mistake_instances.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
      and fr.visible_to_student = true
      and coalesce(fr.release_comments, true) = true
      and fr.revoked_at is null
  )
);

drop policy if exists "owner manages question bank items" on public.question_bank_items;
create policy "owner manages question bank items" on public.question_bank_items for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages question bank children" on public.question_bank_children;
create policy "owner manages question bank children" on public.question_bank_children for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner manages generated papers" on public.generated_papers;
create policy "owner manages generated papers" on public.generated_papers for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner manages generated paper items" on public.generated_paper_items;
create policy "owner manages generated paper items" on public.generated_paper_items for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner manages correction notebooks" on public.correction_notebooks;
create policy "owner manages correction notebooks" on public.correction_notebooks for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "student reads own released correction notebooks" on public.correction_notebooks;
create policy "student reads own released correction notebooks" on public.correction_notebooks for select to authenticated using (
  student_profile_id = public.current_profile_id()
  and exists (
    select 1 from public.feedback_releases fr
    where fr.attempt_id = correction_notebooks.attempt_id
      and fr.visible_to_student = true
      and fr.revoked_at is null
  )
);

drop policy if exists "student creates own released correction notebooks" on public.correction_notebooks;
create policy "student creates own released correction notebooks" on public.correction_notebooks for insert to authenticated with check (
  student_profile_id = public.current_profile_id()
  and exists (
    select 1 from public.attempts a
    join public.feedback_releases fr on fr.attempt_id = a.id
    where a.id = correction_notebooks.attempt_id
      and a.assignee_profile_id = public.current_profile_id()
      and fr.visible_to_student = true
      and fr.revoked_at is null
  )
);

drop policy if exists "student updates own draft correction notebooks" on public.correction_notebooks;
create policy "student updates own draft correction notebooks" on public.correction_notebooks for update to authenticated using (
  student_profile_id = public.current_profile_id()
  and status in ('not_started', 'in_progress')
  and exists (
    select 1 from public.feedback_releases fr
    where fr.attempt_id = correction_notebooks.attempt_id
      and fr.visible_to_student = true
      and fr.revoked_at is null
  )
) with check (
  student_profile_id = public.current_profile_id()
  and status in ('not_started', 'in_progress', 'submitted')
);

drop policy if exists "owner manages correction entries" on public.correction_entries;
create policy "owner manages correction entries" on public.correction_entries for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "student reads own correction entries" on public.correction_entries;
create policy "student reads own correction entries" on public.correction_entries for select to authenticated using (
  exists (
    select 1
    from public.correction_notebooks cn
    join public.feedback_releases fr on fr.attempt_id = cn.attempt_id
    where cn.id = correction_entries.notebook_id
      and cn.student_profile_id = public.current_profile_id()
      and fr.visible_to_student = true
      and fr.revoked_at is null
  )
);

drop policy if exists "student writes own draft correction entries" on public.correction_entries;
create policy "student writes own draft correction entries" on public.correction_entries for all to authenticated using (
  exists (
    select 1
    from public.correction_notebooks cn
    join public.feedback_releases fr on fr.attempt_id = cn.attempt_id
    where cn.id = correction_entries.notebook_id
      and cn.student_profile_id = public.current_profile_id()
      and cn.status in ('not_started', 'in_progress')
      and correction_entries.status in ('draft', 'submitted')
      and fr.visible_to_student = true
      and fr.revoked_at is null
  )
) with check (
  exists (
    select 1
    from public.correction_notebooks cn
    join public.feedback_releases fr on fr.attempt_id = cn.attempt_id
    where cn.id = correction_entries.notebook_id
      and cn.student_profile_id = public.current_profile_id()
      and cn.status in ('not_started', 'in_progress')
      and correction_entries.status in ('draft', 'submitted')
      and fr.visible_to_student = true
      and fr.revoked_at is null
  )
);

create trigger mistake_categories_set_updated_at before update on public.mistake_categories for each row execute function public.set_updated_at();
create trigger question_bank_items_set_updated_at before update on public.question_bank_items for each row execute function public.set_updated_at();
create trigger generated_papers_set_updated_at before update on public.generated_papers for each row execute function public.set_updated_at();
create trigger correction_notebooks_set_updated_at before update on public.correction_notebooks for each row execute function public.set_updated_at();
create trigger correction_entries_set_updated_at before update on public.correction_entries for each row execute function public.set_updated_at();

insert into public.mistake_categories (owner_profile_id, name, description, color, is_default)
select
  p.id,
  preset.name,
  preset.description,
  preset.color,
  true
from public.profiles p
cross join (
  values
    ('Conceptual misunderstanding', 'The core idea or model was misunderstood.', '#7c3aed'),
    ('Calculation error', 'The method is mostly right but arithmetic caused marks to be lost.', '#dc2626'),
    ('Missing units', 'A numerical answer or measurement lacks required units.', '#ea580c'),
    ('Wrong formula', 'The wrong formula, theorem, or identity was selected.', '#be123c'),
    ('No working shown', 'The answer lacks enough working to justify the result.', '#475569'),
    ('Insufficient explanation', 'The reasoning is incomplete for a proof or explanation question.', '#0891b2'),
    ('Graph-reading error', 'A graph, chart, or axis was read incorrectly.', '#2563eb'),
    ('Diagram interpretation error', 'A diagram or geometry figure was interpreted incorrectly.', '#16a34a'),
    ('Notation issue', 'Notation, variables, or formatting created ambiguity.', '#9333ea'),
    ('Command term not addressed', 'The response does not answer the exact command term.', '#0f766e'),
    ('Rounding/significant figures error', 'The answer has rounding or significant figure issues.', '#ca8a04'),
    ('Skipped', 'The question or part was left blank.', '#64748b'),
    ('Time pressure', 'Work appears incomplete due to timing pressure.', '#db2777'),
    ('Misread question', 'The student appears to have answered a different question.', '#b45309'),
    ('Correct method, final answer error', 'The method is correct but the final conclusion or answer is wrong.', '#15803d')
) as preset(name, description, color)
where p.app_role = 'owner'
on conflict (owner_profile_id, name) do nothing;
