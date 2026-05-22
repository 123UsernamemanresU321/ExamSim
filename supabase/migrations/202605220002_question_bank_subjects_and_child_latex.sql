-- Adds assessment subject metadata and child LaTeX preservation for question bank extraction.

alter table public.assessments
  add column if not exists subject text null;

alter table public.question_bank_children
  add column if not exists prompt_latex text null;

create index if not exists assessments_owner_subject_idx on public.assessments(owner_profile_id, subject);
create index if not exists question_bank_items_subject_tags_idx on public.question_bank_items(owner_profile_id, subject, tags);
