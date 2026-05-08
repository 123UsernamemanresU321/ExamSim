-- Add support for storing and serving SEB configuration files
alter table public.assessment_assignments
  add column seb_config_path text null;

alter table public.attempts 
  add column seb_config_path text null;

-- Allow students to read the SEB config file if they are assigned to the attempt
create policy "student reads own seb config" on storage.objects for select to authenticated
  using (
    bucket_id = 'assessment-sources' and
    exists (
      select 1 from public.attempts a
      where a.seb_config_path = storage.objects.name
        and a.assignee_profile_id = public.current_profile_id()
    )
  );
