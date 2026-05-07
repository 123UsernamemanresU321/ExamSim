-- Add missing SEB hash columns to assessment_assignments
-- These columns were added to 'attempts' but missed in 'assessment_assignments',
-- causing publish-assessment edge function to fail when spreading 'timing' object.

alter table public.assessment_assignments
  add column if not exists seb_browser_exam_key_hashes text[] not null default '{}',
  add column if not exists seb_config_key_hashes text[] not null default '{}';
