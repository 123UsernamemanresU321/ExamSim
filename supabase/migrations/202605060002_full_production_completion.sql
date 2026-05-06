create extension if not exists pgcrypto;

alter table public.attempts
  add column if not exists seb_browser_exam_key_hashes text[] not null default '{}',
  add column if not exists seb_config_key_hashes text[] not null default '{}';

alter table public.assessment_versions
  add column if not exists encrypted_package_path text null,
  add column if not exists kms_provider text null,
  add column if not exists wrapped_data_key text null,
  add column if not exists encryption_metadata_json jsonb not null default '{}';

alter table public.parse_jobs drop constraint if exists parse_jobs_parser_check;
alter table public.parse_jobs
  add constraint parse_jobs_parser_check check (parser in ('mineru', 'latex_deterministic', 'json_validator', 'deepseek_ai', 'qti_import'));

alter table public.parse_job_artifacts drop constraint if exists parse_job_artifacts_artifact_kind_check;
alter table public.parse_job_artifacts
  add constraint parse_job_artifacts_artifact_kind_check check (artifact_kind in ('markdown', 'json', 'html', 'layout', 'log', 'ai_json', 'qti_zip'));

create table if not exists public.ai_parse_suggestions (
  id uuid primary key default gen_random_uuid(),
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  parse_job_id uuid null references public.parse_jobs(id) on delete set null,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'deepseek',
  model text not null,
  source_kind text not null check (source_kind in ('pdf', 'latex', 'json', 'mineru')),
  normalized_package_json jsonb not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  warnings_json jsonb not null default '[]',
  review_required boolean not null default true,
  status text not null check (status in ('proposed', 'applied', 'rejected')) default 'proposed',
  created_at timestamptz not null default now()
);

create table if not exists public.encrypted_object_envelopes (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  kms_provider text not null check (kms_provider in ('cloudflare')),
  algorithm text not null check (algorithm in ('AES-GCM')),
  wrapped_data_key text not null,
  iv text not null,
  metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(bucket_id, object_path)
);

create table if not exists public.marking_packet_exports (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'marking-packets',
  object_path text not null,
  encrypted boolean not null default false,
  encrypted_envelope_id uuid null references public.encrypted_object_envelopes(id) on delete set null,
  manifest_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_parse_suggestions_version_created_idx on public.ai_parse_suggestions(assessment_version_id, created_at desc);
create index if not exists encrypted_object_envelopes_owner_idx on public.encrypted_object_envelopes(owner_profile_id, created_at desc);
create index if not exists marking_packet_exports_attempt_created_idx on public.marking_packet_exports(attempt_id, created_at desc);

alter table public.ai_parse_suggestions enable row level security;
alter table public.encrypted_object_envelopes enable row level security;
alter table public.marking_packet_exports enable row level security;

create policy "owner manages ai parse suggestions" on public.ai_parse_suggestions
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner manages encrypted object envelopes" on public.encrypted_object_envelopes
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "owner manages marking packet exports" on public.marking_packet_exports
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
