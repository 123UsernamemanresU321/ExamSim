-- Student read receipts must not depend on direct student SELECT access to
-- feedback_releases. Released feedback content is exposed through Edge
-- Functions; this policy only lets students manage read markers for attempts
-- they already own.

drop policy if exists "students manage own feedback reads" on public.student_feedback_reads;
create policy "students manage own feedback reads" on public.student_feedback_reads for all to authenticated
  using (
    student_profile_id = public.current_profile_id()
    and exists (
      select 1
      from public.attempts a
      where a.id = student_feedback_reads.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
    )
  )
  with check (
    student_profile_id = public.current_profile_id()
    and exists (
      select 1
      from public.attempts a
      where a.id = student_feedback_reads.attempt_id
        and a.assignee_profile_id = public.current_profile_id()
    )
  );
