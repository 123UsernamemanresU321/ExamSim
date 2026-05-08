-- Migration: Add markscheme and feedback enhancements
alter table public.assessment_versions 
  add column markscheme_html text null,
  add column markscheme_pdf_path text null;

alter table public.submission_annotations
  add column is_unreadable boolean not null default false;

alter table public.owner_settings
  add column comment_bank jsonb not null default '[]'::jsonb;

-- Update RLS for submission_annotations to allow unreadable flag
alter table public.submission_annotations drop constraint if exists submission_annotations_annotation_type_check;
alter table public.submission_annotations
  add constraint submission_annotations_annotation_type_check 
  check (annotation_type in ('note', 'rubric', 'moderation', 'feedback', 'student_flag', 'marker_flag'));

-- Refresh types by running: npx supabase gen types typescript --local > types/database.ts
-- (Note: I will update the types/database.ts manually for this mock execution environment)
