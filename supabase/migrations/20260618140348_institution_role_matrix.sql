create table if not exists public.institution_memberships (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  member_profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner_admin', 'teacher', 'marker', 'reviewer', 'invigilator', 'read_only')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  display_label text null,
  permissions_json jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, member_profile_id, role)
);

create index if not exists institution_memberships_owner_status_idx
  on public.institution_memberships(owner_profile_id, status, role);

create index if not exists institution_memberships_member_status_idx
  on public.institution_memberships(member_profile_id, status, updated_at desc);

create unique index if not exists institution_memberships_one_active_role_idx
  on public.institution_memberships(owner_profile_id, member_profile_id)
  where status = 'active';

drop trigger if exists institution_memberships_set_updated_at on public.institution_memberships;
create trigger institution_memberships_set_updated_at
  before update on public.institution_memberships
  for each row execute function public.set_updated_at();

alter table public.institution_memberships enable row level security;

drop policy if exists institution_memberships_owner_manage on public.institution_memberships;
create policy institution_memberships_owner_manage on public.institution_memberships
  for all to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());

drop policy if exists institution_memberships_member_read on public.institution_memberships;
create policy institution_memberships_member_read on public.institution_memberships
  for select to authenticated
  using (member_profile_id = public.current_profile_id() and status = 'active');
