-- Development seed notes:
-- Supabase Auth users are environment-specific and should be created via the
-- create-student Edge Function or Supabase dashboard for local development.
-- This seed keeps sample domain data explicit without faking auth identities.

insert into public.assessment_schedule (
  paper_code,
  external_schedule_ref,
  start_at_utc,
  timezone,
  duration_seconds
)
values (
  'MATH-MOCK-01',
  'adaptive-calendar:math:week-18',
  '2026-05-05T08:00:00Z',
  'Africa/Johannesburg',
  7200
)
on conflict do nothing;
