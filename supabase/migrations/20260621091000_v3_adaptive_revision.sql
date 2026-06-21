-- Teacher-reviewed adaptive revision sets derived only from released evidence.

create table if not exists public.revision_sets (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  rationale text null,
  status text not null default 'draft' check (status in ('draft', 'assigned', 'completed', 'archived')),
  source_analysis_json jsonb not null default '{}',
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  reviewed_by_profile_id uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.revision_set_items (
  id uuid primary key default gen_random_uuid(),
  revision_set_id uuid not null references public.revision_sets(id) on delete cascade,
  question_bank_item_id uuid not null references public.question_bank_items(id) on delete restrict,
  ordinal integer not null check (ordinal >= 0),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  reason text not null,
  created_at timestamptz not null default now(),
  unique (revision_set_id, question_bank_item_id)
);

create table if not exists public.revision_set_assignments (
  id uuid primary key default gen_random_uuid(),
  revision_set_id uuid not null references public.revision_sets(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed', 'revoked')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (revision_set_id, student_profile_id)
);

create index if not exists revision_sets_owner_status_idx on public.revision_sets(owner_profile_id, status, created_at desc);
create index if not exists revision_assignments_student_idx on public.revision_set_assignments(student_profile_id, status, assigned_at desc);

alter table public.revision_sets enable row level security;
alter table public.revision_set_items enable row level security;
alter table public.revision_set_assignments enable row level security;

grant select, insert, update, delete on public.revision_sets to authenticated;
grant select, insert, update, delete on public.revision_set_items to authenticated;
grant select, insert, update, delete on public.revision_set_assignments to authenticated;

create policy institution_revision_sets_manage on public.revision_sets for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'analytics'))
  with check (public.has_institution_permission(owner_profile_id, 'analytics'));
create policy student_revision_sets_read on public.revision_sets for select to authenticated
  using (exists (
    select 1 from public.revision_set_assignments assignment
    join public.profiles profile on profile.id = assignment.student_profile_id
    where assignment.revision_set_id = revision_sets.id
      and profile.auth_user_id = auth.uid()
      and assignment.status in ('assigned', 'in_progress', 'completed')
  ));
create policy institution_revision_items_manage on public.revision_set_items for all to authenticated
  using (public.has_institution_permission((select revision.owner_profile_id from public.revision_sets revision where revision.id = revision_set_items.revision_set_id), 'analytics'))
  with check (public.has_institution_permission((select revision.owner_profile_id from public.revision_sets revision where revision.id = revision_set_items.revision_set_id), 'analytics'));
create policy institution_revision_assignments_manage on public.revision_set_assignments for all to authenticated
  using (public.has_institution_permission((select revision.owner_profile_id from public.revision_sets revision where revision.id = revision_set_assignments.revision_set_id), 'analytics'))
  with check (public.has_institution_permission((select revision.owner_profile_id from public.revision_sets revision where revision.id = revision_set_assignments.revision_set_id), 'analytics'));
create policy student_revision_assignments_read on public.revision_set_assignments for select to authenticated
  using (exists (select 1 from public.profiles profile where profile.id = student_profile_id and profile.auth_user_id = auth.uid()));

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
set search_path = public, extensions
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
  join public.revision_sets revision on revision.id = assignment.revision_set_id
  join public.revision_set_items item on item.revision_set_id = revision.id
  join public.question_bank_items bank on bank.id = item.question_bank_item_id
  where profile.auth_user_id = auth.uid()
    and assignment.status in ('assigned', 'in_progress', 'completed')
    and revision.status in ('assigned', 'completed')
    and bank.readiness_status = 'ready'
    and not bank.do_not_reuse
  order by assignment.assigned_at desc, item.ordinal;
$$;

revoke all on function public.student_revision_assignments_safe() from public;
grant execute on function public.student_revision_assignments_safe() to authenticated;

comment on function public.student_revision_assignments_safe() is 'Returns only assigned, teacher-reviewed revision content for the authenticated student without granting direct Question Library access.';
