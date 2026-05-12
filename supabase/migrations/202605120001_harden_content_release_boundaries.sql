-- Harden production content-release boundaries for hosted projects.
-- Assessment package content, package assets, answer uploads, and released
-- feedback question metadata are served through Edge Functions rather than
-- direct student table or Storage policies.

drop policy if exists "student reads assigned assessment package" on storage.objects;
drop policy if exists "student manages own answer uploads" on storage.objects;
drop policy if exists "student reads released question nodes" on public.question_nodes;
drop policy if exists "student reads released assessment versions" on public.assessment_versions;
drop policy if exists "student reads released marks" on public.marks;
drop policy if exists "student reads released feedback annotations" on public.submission_annotations;
drop policy if exists "student reads own released feedback" on public.feedback_releases;
drop policy if exists "students insert own flags" on public.submission_annotations;
drop policy if exists "students read own flags" on public.submission_annotations;

alter table public.submission_annotations drop constraint if exists submission_annotations_annotation_type_check;
alter table public.submission_annotations
  add constraint submission_annotations_annotation_type_check
  check (annotation_type in ('note', 'rubric', 'moderation', 'feedback', 'student_flag', 'marker_flag'));

create policy "students read own flags" on public.submission_annotations
  for select to authenticated using (
    annotation_type = 'student_flag' and
    exists (
      select 1 from public.attempts a
      where a.id = submission_annotations.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
    )
  );
