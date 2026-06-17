-- Allow owners to delete unused, owner-managed student app profiles without a
-- service-role key. Supabase Auth user deletion remains a separate server-admin
-- cleanup step when SUPABASE_SERVICE_ROLE_KEY is configured.

drop policy if exists "owner deletes unused managed student profiles" on public.profiles;

create policy "owner deletes unused managed student profiles"
on public.profiles
for delete
to authenticated
using (
  public.is_owner()
  and app_role = 'student'
  and (
    owner_profile_id = public.current_profile_id()
    or exists (
      select 1
      from public.owner_student_links osl
      where osl.owner_profile_id = public.current_profile_id()
        and osl.student_profile_id = profiles.id
        and osl.link_type = 'managed_student'
    )
  )
  and not exists (
    select 1
    from public.attempts a
    where a.assignee_profile_id = profiles.id
  )
);
