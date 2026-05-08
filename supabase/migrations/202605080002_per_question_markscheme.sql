-- Migration: Add per-question markscheme support
alter table public.question_nodes 
  add column markscheme_html text null;

-- This allows individual questions to have their own markscheme content
-- in addition to the global assessment-level markscheme.
