-- Resolve production advisor findings without widening any Data API boundary.
-- Privileged maintenance functions remain callable only by the roles that use them.

alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.current_app_role() set search_path = pg_catalog;
alter function public.is_owner() set search_path = pg_catalog;
alter function public.current_profile_id() set search_path = pg_catalog;
alter function public.compute_attempt_state(timestamptz, timestamptz, timestamptz, boolean) set search_path = pg_catalog;
alter function public.current_auth_aal() set search_path = pg_catalog;
alter function public.is_owner_aal2() set search_path = pg_catalog;
alter function public.active_exam_session_state(timestamptz, timestamptz, timestamptz, integer, text) set search_path = pg_catalog;
alter function public.audit_owner_action(text, text, uuid, jsonb) set search_path = pg_catalog;
alter function public.create_upload_slots_for_attempt(uuid) set search_path = pg_catalog;
alter function public.generate_moderation_summary(uuid) set search_path = pg_catalog;

revoke all on function public.current_profile_id() from public, anon;
grant execute on function public.current_profile_id() to authenticated, service_role;

revoke all on function public.audit_owner_action(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.audit_owner_action(text, text, uuid, jsonb) to authenticated, service_role;

revoke all on function public.create_upload_slots_for_attempt(uuid) from public, anon, authenticated;
grant execute on function public.create_upload_slots_for_attempt(uuid) to service_role;

revoke all on function public.generate_moderation_summary(uuid) from public, anon, authenticated;
grant execute on function public.generate_moderation_summary(uuid) to service_role;
