-- Use the actual catalog constraint name. PostgreSQL abbreviates each source
-- column segment when generating names that would exceed 63 bytes.
do $$
declare
  function_definition text;
  deployed_target constant text := 'on conflict on constraint marking_submissions_attempt_id_marker_profile_id_marking_round_key';
  catalog_target constant text := 'on conflict on constraint marking_submissions_attempt_id_marker_profile_id_marking_ro_key';
begin
  select pg_get_functiondef('public.submit_marking_snapshot(uuid,uuid)'::regprocedure)
  into function_definition;

  if position(deployed_target in function_definition) = 0 then
    raise exception 'Expected deployed marking snapshot constraint target was not found';
  end if;

  execute replace(function_definition, deployed_target, catalog_target);
end;
$$;
