-- Question provenance/readiness metadata and generated-paper blueprint health.

alter table public.question_bank_items
  add column if not exists subtopic text null,
  add column if not exists year integer null check (year is null or year between 1900 and 2200),
  add column if not exists paper_type text null,
  add column if not exists command_term text null,
  add column if not exists curriculum_standard_ids uuid[] not null default '{}',
  add column if not exists interaction_json jsonb null,
  add column if not exists performance_stats_json jsonb not null default '{}',
  add column if not exists content_fingerprint text null,
  add column if not exists readiness_status text not null default 'needs_review'
    check (readiness_status in ('needs_review', 'ready', 'retired')),
  add column if not exists source_history_json jsonb not null default '[]';
alter table public.question_bank_items
  add column if not exists rubric_json jsonb not null default '[]';

alter table public.question_bank_children
  add column if not exists source_question_node_id uuid null references public.question_nodes(id) on delete set null,
  add column if not exists response_mode text not null default 'none'
    check (response_mode in ('none', 'typed_text', 'upload_pdf', 'typed_or_upload', 'multiple_choice', 'numerical')),
  add column if not exists interaction_json jsonb null,
  add column if not exists source_region_json jsonb null,
  add column if not exists visual_asset_refs jsonb not null default '[]';

alter table public.generated_papers
  add column if not exists readiness_score integer not null default 0 check (readiness_score between 0 and 100),
  add column if not exists health_warnings_json jsonb not null default '[]';

create index if not exists question_bank_items_blueprint_idx
  on public.question_bank_items(owner_profile_id, readiness_status, subject, paper_type, command_term, estimated_difficulty);
create index if not exists question_bank_items_fingerprint_idx
  on public.question_bank_items(owner_profile_id, content_fingerprint)
  where content_fingerprint is not null;
create index if not exists question_bank_items_standards_idx
  on public.question_bank_items using gin(curriculum_standard_ids);

comment on column public.question_bank_items.content_fingerprint is
  'Normalized content hash used to warn about likely duplicates; it never auto-merges source history.';
comment on column public.question_bank_items.source_history_json is
  'Reviewable provenance history retained when a teacher intentionally reconciles duplicate sources.';
comment on column public.question_bank_items.rubric_json is
  'Reviewable rubric snapshot retained with the reusable question provenance.';
