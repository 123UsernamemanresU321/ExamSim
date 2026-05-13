alter table public.attempt_sessions
  add column if not exists seb_verified_at timestamptz null,
  add column if not exists seb_verification_method text null,
  add column if not exists seb_verification_url text null,
  add column if not exists seb_version text null,
  add column if not exists seb_last_error text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attempt_sessions_seb_verification_method_check'
  ) then
    alter table public.attempt_sessions
      add constraint attempt_sessions_seb_verification_method_check
      check (
        seb_verification_method is null
        or seb_verification_method in ('header', 'js_api', 'handshake_header')
      );
  end if;
end $$;

create index if not exists attempt_sessions_seb_verified_at_idx
  on public.attempt_sessions (attempt_id, seb_verified_at desc)
  where seb_verified_at is not null;

comment on column public.attempt_sessions.seb_verified_at is
  'Server time when this attempt session last proved valid SEB Browser Exam Key and Config Key request hashes.';

comment on column public.attempt_sessions.seb_verification_url is
  'Canonical URL without fragment used to verify the URL-specific SEB request hashes.';

comment on column public.attempt_sessions.browser_exam_key_hash is
  'Received URL-specific SEB Browser Exam Key request hash evidence, not the copied base Browser Exam Key.';

comment on column public.attempt_sessions.config_key_hash is
  'Received URL-specific SEB Config Key request hash evidence, not the copied base Config Key.';
