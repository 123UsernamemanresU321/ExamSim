-- Migration: Add assets to question_nodes
ALTER TABLE public.question_nodes ADD COLUMN assets text[] DEFAULT '{}';
COMMENT ON COLUMN public.question_nodes.assets IS 'Array of storage paths to diagrams/images for this question.';
