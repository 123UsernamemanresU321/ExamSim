create table if not exists public.export_download_history (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  assessment_id uuid null references public.assessments(id) on delete set null,
  export_kind text not null,
  format text not null,
  object_path text null,
  row_count integer null check (row_count is null or row_count >= 0),
  status text not null default 'completed' check (status in ('completed', 'review_required', 'failed')),
  fidelity_warnings_json jsonb not null default '[]',
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists export_download_history_owner_idx on public.export_download_history(owner_profile_id, created_at desc);
alter table public.export_download_history enable row level security;
grant select, insert on public.export_download_history to authenticated;
create policy institution_export_history_read on public.export_download_history for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'exports'));
create policy institution_export_history_insert on public.export_download_history for insert to authenticated
  with check (public.has_institution_permission(owner_profile_id, 'exports') and actor_profile_id = public.current_profile_id());

comment on table public.export_download_history is 'Auditable owner-scoped export generation and download evidence, including fidelity warnings for lossy formats.';
