-- Atomic owner-scoped provider budgets and reviewed live Smart Import QA evidence.

create table if not exists public.provider_monthly_usage (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('deepseek', 'mineru', 'simpletex')),
  unit text not null check (unit in ('usd', 'page')),
  period_start date not null,
  units_consumed numeric(14, 4) not null default 0 check (units_consumed >= 0),
  limit_amount numeric(14, 4) not null check (limit_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, provider, unit, period_start)
);

create index if not exists provider_monthly_usage_owner_period_idx
  on public.provider_monthly_usage(owner_profile_id, period_start desc, provider);

alter table public.provider_monthly_usage enable row level security;
revoke all on table public.provider_monthly_usage from anon, authenticated;

create or replace function public.consume_provider_monthly_quota(
  p_owner_profile_id uuid,
  p_provider text,
  p_unit text,
  p_units numeric,
  p_limit_amount numeric
)
returns table(allowed boolean, consumed numeric, remaining numeric, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := date_trunc('month', timezone('UTC', now()))::date;
  v_reset_at timestamptz := ((date_trunc('month', timezone('UTC', now())) + interval '1 month') at time zone 'UTC');
  v_consumed numeric := 0;
begin
  if p_owner_profile_id is null then
    raise exception 'Provider quota owner is required';
  end if;
  if p_provider not in ('deepseek', 'mineru', 'simpletex') then
    raise exception 'Unsupported provider quota';
  end if;
  if p_unit not in ('usd', 'page') then
    raise exception 'Unsupported provider quota unit';
  end if;
  if p_units <= 0 or p_limit_amount <= 0 then
    raise exception 'Provider quota values must be positive';
  end if;

  if p_units <= p_limit_amount then
    insert into public.provider_monthly_usage (
      owner_profile_id,
      provider,
      unit,
      period_start,
      units_consumed,
      limit_amount,
      updated_at
    ) values (
      p_owner_profile_id,
      p_provider,
      p_unit,
      v_period_start,
      p_units,
      p_limit_amount,
      now()
    )
    on conflict (owner_profile_id, provider, unit, period_start)
    do update set
      units_consumed = public.provider_monthly_usage.units_consumed + excluded.units_consumed,
      limit_amount = excluded.limit_amount,
      updated_at = now()
    where public.provider_monthly_usage.units_consumed + excluded.units_consumed <= excluded.limit_amount
    returning units_consumed into v_consumed;
  end if;

  if found then
    return query select true, v_consumed, greatest(p_limit_amount - v_consumed, 0), v_reset_at;
    return;
  end if;

  select usage.units_consumed
  into v_consumed
  from public.provider_monthly_usage usage
  where usage.owner_profile_id = p_owner_profile_id
    and usage.provider = p_provider
    and usage.unit = p_unit
    and usage.period_start = v_period_start;

  v_consumed := coalesce(v_consumed, 0);
  return query select false, v_consumed, greatest(p_limit_amount - v_consumed, 0), v_reset_at;
end;
$$;

revoke all on function public.consume_provider_monthly_quota(uuid, text, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.consume_provider_monthly_quota(uuid, text, text, numeric, numeric)
  to service_role;

create table if not exists public.smart_import_qa_results (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  fixture_id text not null,
  status text not null check (status in ('passed', 'failed', 'needs_review', 'provider_required', 'not_run')),
  provider text not null,
  checks_json jsonb not null default '[]'::jsonb,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  expected_json jsonb not null default '{}'::jsonb,
  actual_json jsonb not null default '{}'::jsonb,
  evidence_json jsonb not null default '{}'::jsonb,
  error_message text null,
  reviewed_by_profile_id uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id, fixture_id)
);

create index if not exists smart_import_qa_results_owner_idx
  on public.smart_import_qa_results(owner_profile_id, updated_at desc);

alter table public.smart_import_qa_results enable row level security;
grant select on public.smart_import_qa_results to authenticated;
revoke insert, update, delete on public.smart_import_qa_results from anon, authenticated;

create policy smart_import_qa_results_owner_read
  on public.smart_import_qa_results
  for select
  to authenticated
  using (public.has_institution_permission(owner_profile_id, 'readiness_security'));
