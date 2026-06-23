-- The Paper Mode generator performs its own institution permission check, but it
-- must never be exposed to unauthenticated callers through PostgREST.

revoke all on function public.institution_generate_paper_mode_booklets(uuid) from public, anon;
grant execute on function public.institution_generate_paper_mode_booklets(uuid) to authenticated, service_role;

comment on function public.institution_generate_paper_mode_booklets(uuid) is
  'Creates roster booklets only for an authenticated institution author. Anonymous execution is explicitly revoked.';
