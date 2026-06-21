-- Production-safe manual Paper Mode. Automatic OCR/barcode mapping remains provider-gated.

create table if not exists public.paper_mode_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete restrict,
  title text not null,
  duration_seconds integer not null default 3600 check (duration_seconds between 60 and 43200),
  status text not null default 'draft' check (status in ('draft', 'printed', 'scanning', 'mapping', 'ready_to_mark', 'completed', 'archived')),
  instructions text null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paper_mode_booklets (
  id uuid primary key default gen_random_uuid(),
  paper_mode_job_id uuid not null references public.paper_mode_jobs(id) on delete cascade,
  roster_entry_id uuid null references public.student_roster_entries(id) on delete set null,
  student_profile_id uuid null references public.profiles(id) on delete set null,
  attempt_id uuid null references public.attempts(id) on delete set null,
  booklet_code text not null unique,
  student_number_snapshot text null,
  student_name_snapshot text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (paper_mode_job_id, roster_entry_id)
);

create table if not exists public.paper_mode_scans (
  id uuid primary key default gen_random_uuid(),
  paper_mode_job_id uuid not null references public.paper_mode_jobs(id) on delete cascade,
  booklet_id uuid null references public.paper_mode_booklets(id) on delete set null,
  object_path text not null unique,
  original_file_name text null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  page_count integer null check (page_count is null or page_count > 0),
  status text not null default 'needs_mapping' check (status in ('needs_mapping', 'partially_mapped', 'mapped', 'rejected')),
  mapping_confidence numeric null check (mapping_confidence is null or mapping_confidence between 0 and 1),
  uploaded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paper_mode_scan_pages (
  id uuid primary key default gen_random_uuid(),
  paper_mode_scan_id uuid not null references public.paper_mode_scans(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  booklet_id uuid null references public.paper_mode_booklets(id) on delete set null,
  attempt_id uuid null references public.attempts(id) on delete set null,
  question_node_id uuid null references public.question_nodes(id) on delete set null,
  mapping_status text not null default 'unmapped' check (mapping_status in ('unmapped', 'needs_review', 'mapped', 'rejected')),
  mapping_confidence numeric null check (mapping_confidence is null or mapping_confidence between 0 and 1),
  notes text null,
  mapped_by_profile_id uuid null references public.profiles(id) on delete set null,
  mapped_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_mode_scan_id, page_number)
);

create index if not exists paper_mode_jobs_owner_idx on public.paper_mode_jobs(owner_profile_id, status, created_at desc);
create index if not exists paper_mode_booklets_job_idx on public.paper_mode_booklets(paper_mode_job_id, student_number_snapshot);
create index if not exists paper_mode_scans_job_idx on public.paper_mode_scans(paper_mode_job_id, status, created_at desc);
create index if not exists paper_mode_scan_pages_mapping_idx on public.paper_mode_scan_pages(mapping_status, attempt_id, question_node_id);

alter table public.paper_mode_jobs enable row level security;
alter table public.paper_mode_booklets enable row level security;
alter table public.paper_mode_scans enable row level security;
alter table public.paper_mode_scan_pages enable row level security;

grant select, insert, update, delete on public.paper_mode_jobs to authenticated;
grant select, insert, update, delete on public.paper_mode_booklets to authenticated;
grant select, insert, update, delete on public.paper_mode_scans to authenticated;
grant select, insert, update, delete on public.paper_mode_scan_pages to authenticated;

create policy institution_paper_mode_jobs on public.paper_mode_jobs for all to authenticated
  using (public.has_institution_permission(owner_profile_id, 'assessment_authoring') or public.has_institution_permission(owner_profile_id, 'marking'))
  with check (public.has_institution_permission(owner_profile_id, 'assessment_authoring'));
create policy institution_paper_mode_booklets on public.paper_mode_booklets for all to authenticated
  using (public.has_institution_permission((select job.owner_profile_id from public.paper_mode_jobs job where job.id = paper_mode_booklets.paper_mode_job_id), 'assessment_authoring') or public.has_institution_permission((select job.owner_profile_id from public.paper_mode_jobs job where job.id = paper_mode_booklets.paper_mode_job_id), 'marking'))
  with check (public.has_institution_permission((select job.owner_profile_id from public.paper_mode_jobs job where job.id = paper_mode_booklets.paper_mode_job_id), 'assessment_authoring'));
create policy institution_paper_mode_scans on public.paper_mode_scans for all to authenticated
  using (public.has_institution_permission((select job.owner_profile_id from public.paper_mode_jobs job where job.id = paper_mode_scans.paper_mode_job_id), 'marking'))
  with check (public.has_institution_permission((select job.owner_profile_id from public.paper_mode_jobs job where job.id = paper_mode_scans.paper_mode_job_id), 'marking'));
create policy institution_paper_mode_scan_pages on public.paper_mode_scan_pages for all to authenticated
  using (public.has_institution_permission((select job.owner_profile_id from public.paper_mode_scans scan join public.paper_mode_jobs job on job.id = scan.paper_mode_job_id where scan.id = paper_mode_scan_pages.paper_mode_scan_id), 'marking'))
  with check (public.has_institution_permission((select job.owner_profile_id from public.paper_mode_scans scan join public.paper_mode_jobs job on job.id = scan.paper_mode_job_id where scan.id = paper_mode_scan_pages.paper_mode_scan_id), 'marking'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paper-scans', 'paper-scans', false, 52428800, array['application/pdf']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy institution_paper_scan_storage on storage.objects for all to authenticated
  using (bucket_id = 'paper-scans' and public.has_institution_permission(public.storage_owner_profile_id(name), 'marking'))
  with check (bucket_id = 'paper-scans' and public.has_institution_permission(public.storage_owner_profile_id(name), 'marking'));

comment on table public.paper_mode_scan_pages is 'Manual page-to-student/attempt/question mapping evidence. Provider suggestions remain needs_review until a marker confirms them.';

create or replace function public.institution_generate_paper_mode_booklets(p_job_id uuid)
returns table(booklet_id uuid, attempt_id uuid, booklet_code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_job public.paper_mode_jobs%rowtype;
  roster public.student_roster_entries%rowtype;
  generated_attempt_id uuid;
  generated_booklet_id uuid;
  generated_code text;
  now_utc timestamptz := now();
begin
  select * into target_job from public.paper_mode_jobs where id = p_job_id for update;
  if target_job.id is null then raise exception 'Paper Mode job not found'; end if;
  if not public.has_institution_permission(target_job.owner_profile_id, 'assessment_authoring') then
    raise exception 'Forbidden';
  end if;
  if target_job.status in ('completed', 'archived') then
    raise exception 'This Paper Mode job is closed';
  end if;
  if not exists (select 1 from public.student_roster_entries entry where entry.owner_profile_id = target_job.owner_profile_id and entry.active) then
    raise exception 'Add at least one active roster student before generating booklets';
  end if;

  for roster in
    select * from public.student_roster_entries
    where owner_profile_id = target_job.owner_profile_id and active
    order by student_number, display_name
  loop
    select booklet.id, booklet.attempt_id, booklet.booklet_code
      into generated_booklet_id, generated_attempt_id, generated_code
    from public.paper_mode_booklets booklet
    where booklet.paper_mode_job_id = target_job.id and booklet.roster_entry_id = roster.id;

    if generated_booklet_id is null then
      insert into public.attempts (
        assessment_id, assessment_version_id, assignee_profile_id, roster_entry_id,
        guest_student_name, guest_student_number, guest_class_group,
        start_at_utc, duration_seconds, end_at_utc, upload_deadline_at_utc,
        display_timezone, delivery_mode, solutions_requested, typed_enabled,
        per_question_upload_enabled, require_blank_for_skipped, state_cache,
        forced_submitted_at, claim_status, identity_review_status
      ) values (
        target_job.assessment_id, target_job.assessment_version_id, roster.student_profile_id, roster.id,
        roster.display_name, roster.student_number, roster.class_group,
        now_utc - make_interval(secs => target_job.duration_seconds), target_job.duration_seconds, now_utc, now_utc,
        'Africa/Johannesburg', 'browser', false, false,
        false, false, 'FINISHED_REVIEW', now_utc,
        case when roster.student_profile_id is null then 'unclaimed' else 'not_required' end,
        'not_required'
      ) returning id into generated_attempt_id;

      generated_code := 'PM-' || upper(substr(replace(target_job.id::text, '-', ''), 1, 6)) || '-' || upper(substr(replace(roster.id::text, '-', ''), 1, 6));
      insert into public.paper_mode_booklets (
        paper_mode_job_id, roster_entry_id, student_profile_id, attempt_id,
        booklet_code, student_number_snapshot, student_name_snapshot
      ) values (
        target_job.id, roster.id, roster.student_profile_id, generated_attempt_id,
        generated_code, roster.student_number, roster.display_name
      ) returning id into generated_booklet_id;
    end if;

    booklet_id := generated_booklet_id;
    attempt_id := generated_attempt_id;
    booklet_code := generated_code;
    return next;
  end loop;

  update public.paper_mode_jobs
  set status = 'printed', updated_at = now()
  where id = target_job.id;
end;
$$;

revoke all on function public.institution_generate_paper_mode_booklets(uuid) from public;
grant execute on function public.institution_generate_paper_mode_booklets(uuid) to authenticated;

comment on function public.institution_generate_paper_mode_booklets(uuid) is 'Atomically creates one finished paper attempt and immutable booklet identity per active roster student after institution authoring permission is checked.';
