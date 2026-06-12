-- Exam Vault 20-feature operations package.
-- Adds owner-side persisted views, bulk operation audit records, and marker assignments.

create extension if not exists pgcrypto;

create table if not exists public.owner_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  view_scope text not null check (view_scope in (
    'assessments',
    'attempts',
    'marking_queue',
    'marking_workspace',
    'feedback',
    'students',
    'question_bank',
    'security',
    'support_console'
  )),
  name text not null,
  filters_json jsonb not null default '{}',
  sort_json jsonb not null default '{}',
  columns_json jsonb not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, view_scope, name)
);

create table if not exists public.owner_bulk_operations (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_type text not null check (operation_type in (
    'release_feedback',
    'grant_upload_extension',
    'mark_incident_reviewed',
    'queue_recovery_review',
    'assign_marker',
    'export_receipts'
  )),
  target_kind text not null check (target_kind in ('attempt', 'assessment', 'student', 'upload_slot')),
  target_ids uuid[] not null default '{}',
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'partial')) default 'queued',
  request_json jsonb not null default '{}',
  result_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists public.marker_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid null references public.assessments(id) on delete cascade,
  attempt_id uuid null references public.attempts(id) on delete cascade,
  question_node_id uuid null references public.question_nodes(id) on delete cascade,
  marker_profile_id uuid not null references public.profiles(id) on delete cascade,
  assignment_scope text not null check (assignment_scope in ('attempt', 'root_question', 'leaf_question')),
  status text not null check (status in ('assigned', 'in_progress', 'completed', 'released')) default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (assignment_scope = 'attempt' and attempt_id is not null and question_node_id is null)
    or (assignment_scope in ('root_question', 'leaf_question') and attempt_id is not null and question_node_id is not null)
  )
);

create index if not exists owner_saved_views_owner_scope_idx on public.owner_saved_views(owner_profile_id, view_scope, updated_at desc);
create unique index if not exists owner_saved_views_one_default_idx
  on public.owner_saved_views(owner_profile_id, view_scope)
  where is_default;
create index if not exists owner_bulk_operations_owner_created_idx on public.owner_bulk_operations(owner_profile_id, created_at desc);
create index if not exists owner_bulk_operations_status_idx on public.owner_bulk_operations(status, created_at desc);
create index if not exists marker_assignments_owner_status_idx on public.marker_assignments(owner_profile_id, status, updated_at desc);
create index if not exists marker_assignments_attempt_idx on public.marker_assignments(attempt_id, question_node_id);
create index if not exists marker_assignments_marker_idx on public.marker_assignments(marker_profile_id, status, updated_at desc);

alter table public.owner_saved_views enable row level security;
alter table public.owner_bulk_operations enable row level security;
alter table public.marker_assignments enable row level security;

drop policy if exists "owner manages own saved views" on public.owner_saved_views;
create policy "owner manages own saved views" on public.owner_saved_views for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

drop policy if exists "owner manages own bulk operations" on public.owner_bulk_operations;
create policy "owner manages own bulk operations" on public.owner_bulk_operations for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

drop policy if exists "owner manages own marker assignments" on public.marker_assignments;
create policy "owner manages own marker assignments" on public.marker_assignments for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

drop policy if exists "assigned owner reads own marker assignments" on public.marker_assignments;
create policy "assigned owner reads own marker assignments" on public.marker_assignments for select to authenticated
  using (public.is_owner() and marker_profile_id = public.current_profile_id());
