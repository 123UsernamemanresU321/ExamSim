-- The RETURNS TABLE column named marking_round is a PL/pgSQL variable. Target
-- the unique constraint by name so ON CONFLICT cannot resolve it ambiguously.
do $$
declare
  function_definition text;
  original_target constant text := 'on conflict (attempt_id, marker_profile_id, marking_round)';
  replacement_target constant text := 'on conflict on constraint marking_submissions_attempt_id_marker_profile_id_marking_round_key';
begin
  select pg_get_functiondef('public.submit_marking_snapshot(uuid,uuid)'::regprocedure)
  into function_definition;

  if position(original_target in function_definition) = 0 then
    raise exception 'Expected marking snapshot conflict target was not found';
  end if;

  execute replace(function_definition, original_target, replacement_target);
end;
$$;

-- Hosted projects can have explicit default grants to anon in addition to the
-- PostgreSQL PUBLIC grant, so both principals must be revoked.
revoke all on function public.has_institution_permission(uuid, text) from public, anon;
revoke all on function public.owner_profile_id_for_attempt(uuid) from public, anon;
revoke all on function public.audit_institution_action(uuid, text, text, uuid, jsonb) from public, anon;
revoke all on function public.institution_link_guest_attempt(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.institution_resolve_guest_identity(uuid, uuid, uuid) from public, anon;
revoke all on function public.institution_review_attempt_claim(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.institution_start_attempt_rest_break(uuid, uuid, uuid, text, integer) from public, anon;
revoke all on function public.institution_resume_attempt_rest_break(uuid, uuid, uuid) from public, anon;
revoke all on function public.institution_apply_timing_intervention(uuid, uuid, uuid, text, integer) from public, anon;
revoke all on function public.reconcile_marking_review(uuid, uuid) from public, anon;
revoke all on function public.submit_marking_snapshot(uuid, uuid) from public, anon;
revoke all on function public.review_marking_submission(uuid, uuid, text, uuid, text) from public, anon;
