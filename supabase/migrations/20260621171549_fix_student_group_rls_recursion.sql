create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.student_is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.student_group_members member
    where member.group_id = target_group_id
      and member.student_profile_id = public.current_profile_id()
  );
$$;

revoke all on function private.student_is_group_member(uuid) from public, anon;
grant execute on function private.student_is_group_member(uuid) to authenticated, service_role;

drop policy if exists "student reads own groups" on public.student_groups;
create policy "student reads own groups"
  on public.student_groups
  for select
  to authenticated
  using (private.student_is_group_member(id));

comment on function private.student_is_group_member(uuid) is
  'Checks the current profile group membership without recursively evaluating student group RLS policies.';
