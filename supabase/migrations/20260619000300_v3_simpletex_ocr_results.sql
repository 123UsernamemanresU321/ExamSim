-- Review-required OCR results from server-side providers such as SimpleTeX.

create table if not exists public.ocr_provider_results (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  source_page_id uuid not null references public.source_pages(id) on delete cascade,
  source_region_id uuid null references public.question_source_regions(id) on delete set null,
  provider text not null,
  recognition_mode text not null,
  status text not null default 'needs_review' check (status in ('needs_review', 'approved', 'rejected', 'failed')),
  extracted_text text null,
  extracted_latex text null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provider_request_id text null,
  provider_payload_json jsonb not null default '{}',
  error_message text null,
  reviewed_by_profile_id uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ocr_provider_results_owner_status_idx
  on public.ocr_provider_results(owner_profile_id, status, created_at desc);

create index if not exists ocr_provider_results_page_idx
  on public.ocr_provider_results(source_page_id, created_at desc);

create trigger ocr_provider_results_set_updated_at
  before update on public.ocr_provider_results
  for each row execute function public.set_updated_at();

alter table public.ocr_provider_results enable row level security;
grant select, insert, update, delete on public.ocr_provider_results to authenticated;

create policy "owner manages OCR provider results"
  on public.ocr_provider_results
  for all
  to authenticated
  using (public.is_owner() and owner_profile_id = public.current_profile_id())
  with check (public.is_owner() and owner_profile_id = public.current_profile_id());
