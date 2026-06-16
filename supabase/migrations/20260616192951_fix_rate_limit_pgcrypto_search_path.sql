create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.consume_edge_rate_limit(
  p_scope text,
  p_key text,
  p_limit_count integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_key_hash text;
  v_count integer;
  v_reset_at timestamptz;
begin
  if length(coalesce(trim(p_scope), '')) = 0 or length(coalesce(trim(p_key), '')) = 0 then
    raise exception 'Invalid rate limit key';
  end if;
  if p_limit_count <= 0 or p_window_seconds <= 0 then
    raise exception 'Invalid rate limit parameters';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);
  v_key_hash := encode(digest(p_key::text, 'sha256'::text), 'hex');

  insert into public.edge_rate_limits (
    scope,
    key_hash,
    window_start,
    request_count,
    limit_count,
    expires_at,
    updated_at
  )
  values (
    p_scope,
    v_key_hash,
    v_window_start,
    1,
    p_limit_count,
    v_reset_at,
    v_now
  )
  on conflict (scope, key_hash, window_start)
  do update set
    request_count = public.edge_rate_limits.request_count + 1,
    limit_count = excluded.limit_count,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
  returning request_count into v_count;

  return query select
    v_count <= p_limit_count,
    greatest(p_limit_count - v_count, 0),
    v_reset_at;
end;
$$;

revoke all on function public.consume_edge_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer) to service_role;
