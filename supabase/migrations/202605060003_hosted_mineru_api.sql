alter table public.parse_jobs
  add column if not exists external_provider text null check (external_provider in ('mineru_hosted')),
  add column if not exists external_batch_id text null,
  add column if not exists external_task_id text null,
  add column if not exists external_data_id text null,
  add column if not exists external_state text null,
  add column if not exists metadata_json jsonb not null default '{}';

alter table public.parse_jobs drop constraint if exists parse_jobs_parser_check;
alter table public.parse_jobs
  add constraint parse_jobs_parser_check check (parser in ('mineru', 'mineru_hosted', 'latex_deterministic', 'json_validator', 'deepseek_ai', 'qti_import'));

alter table public.parse_job_artifacts drop constraint if exists parse_job_artifacts_artifact_kind_check;
alter table public.parse_job_artifacts
  add constraint parse_job_artifacts_artifact_kind_check check (artifact_kind in ('markdown', 'json', 'html', 'layout', 'log', 'zip', 'ai_json', 'qti_zip'));

create index if not exists parse_jobs_external_batch_idx on public.parse_jobs(external_provider, external_batch_id)
  where external_batch_id is not null;
