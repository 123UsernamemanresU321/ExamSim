-- Secure, expiring, one-time guest-attempt claim codes.
-- Claim-code redemption is service-role only through the checked Edge Function.

alter table public.attempts
  add column if not exists claim_code_expires_at timestamptz null,
  add column if not exists claim_code_used_at timestamptz null,
  add column if not exists claim_requested_by_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists claim_reviewed_at timestamptz null,
  add column if not exists claim_reviewed_by_profile_id uuid null references public.profiles(id) on delete set null;

create unique index if not exists attempts_active_claim_code_hash_idx
  on public.attempts(claim_code_hash)
  where claim_code_hash is not null;

create index if not exists attempts_claim_review_queue_idx
  on public.attempts(exam_session_id, claim_status, updated_at desc)
  where claim_status = 'pending';

create or replace function public.consume_attempt_claim_code(
  p_claim_code_hash text,
  p_student_profile_id uuid
)
returns table(claim_result text, claimed_attempt_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attempt public.attempts%rowtype;
  target_roster public.student_roster_entries%rowtype;
begin
  if p_claim_code_hash is null or length(p_claim_code_hash) <> 64 or p_student_profile_id is null then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  select a.*
  into target_attempt
  from public.attempts a
  where a.claim_code_hash = p_claim_code_hash
    and a.claim_code_used_at is null
    and a.claim_code_expires_at > now()
    and a.claim_status in ('unclaimed', 'pending')
    and exists (
      select 1
      from public.feedback_releases fr
      where fr.attempt_id = a.id
        and fr.visible_to_student = true
        and fr.revoked_at is null
    )
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if target_attempt.assignee_profile_id is not null
     and target_attempt.assignee_profile_id <> p_student_profile_id then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if target_attempt.roster_entry_id is not null then
    select *
    into target_roster
    from public.student_roster_entries
    where id = target_attempt.roster_entry_id;
  end if;

  if target_roster.student_profile_id is not null
     and target_roster.student_profile_id <> p_student_profile_id then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if target_attempt.assignee_profile_id = p_student_profile_id
     or target_roster.student_profile_id = p_student_profile_id then
    update public.attempts
    set assignee_profile_id = p_student_profile_id,
        claim_status = 'linked',
        claim_code_hash = null,
        claim_code_used_at = now(),
        claim_requested_by_profile_id = p_student_profile_id,
        claim_reviewed_at = now(),
        identity_review_status = 'resolved',
        updated_at = now()
    where id = target_attempt.id;

    return query select 'linked'::text, target_attempt.id;
    return;
  end if;

  update public.attempts
  set claim_status = 'pending',
      claim_code_hash = null,
      claim_code_used_at = now(),
      claim_requested_by_profile_id = p_student_profile_id,
      identity_review_status = 'needs_review',
      updated_at = now()
  where id = target_attempt.id;

  return query select 'pending'::text, target_attempt.id;
end;
$$;

revoke all on function public.consume_attempt_claim_code(text, uuid) from public;
revoke all on function public.consume_attempt_claim_code(text, uuid) from anon;
revoke all on function public.consume_attempt_claim_code(text, uuid) from authenticated;
grant execute on function public.consume_attempt_claim_code(text, uuid) to service_role;

