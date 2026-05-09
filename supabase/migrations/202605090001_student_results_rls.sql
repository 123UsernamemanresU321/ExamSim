-- Migration: Allow students to read question nodes and assessment versions for released feedback
-- This enables the student results view to show the question tree with marks and feedback.
-- Access is narrowly scoped: only when a feedback_release exists and is visible_to_student.

-- Student can read question_nodes when their attempt has released feedback
create policy "student reads released question nodes" on public.question_nodes for select to authenticated using (
  exists (
    select 1 from public.attempts a
    join public.feedback_releases fr on fr.attempt_id = a.id
    where a.assessment_version_id = question_nodes.assessment_version_id
      and a.assignee_profile_id = public.current_profile_id()
      and fr.visible_to_student
  )
);

-- Student can read assessment_versions when their attempt has released feedback
create policy "student reads released assessment versions" on public.assessment_versions for select to authenticated using (
  exists (
    select 1 from public.attempts a
    join public.feedback_releases fr on fr.attempt_id = a.id
    where a.assessment_version_id = assessment_versions.id
      and a.assignee_profile_id = public.current_profile_id()
      and fr.visible_to_student
  )
);
