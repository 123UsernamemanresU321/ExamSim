-- Track optional markscheme source material separately from the assessment paper.
-- The source remains in private Storage; AI suggestions are review-required.
alter table public.assessment_versions
  add column if not exists markscheme_source_kind text null
    check (markscheme_source_kind in ('pdf', 'latex', 'json')),
  add column if not exists markscheme_source_object_path text null;

comment on column public.assessment_versions.markscheme_source_kind is
  'Optional owner-supplied markscheme source type. Parsed evidence remains review-required before publish.';

comment on column public.assessment_versions.markscheme_source_object_path is
  'Private assessment-sources object path for the optional markscheme source.';
