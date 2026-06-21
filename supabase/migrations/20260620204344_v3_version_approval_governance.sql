-- Audited draft -> reviewed -> approved -> published governance.

alter table public.assessment_versions
  add column if not exists governance_status text not null default 'draft'
    check (governance_status in ('draft', 'reviewed', 'approved', 'published'));

update public.assessment_versions
set governance_status = case when status = 'published' then 'published' else 'draft' end;

create table if not exists public.assessment_version_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  assessment_version_id uuid not null references public.assessment_versions(id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check (decision in ('reviewed', 'approved', 'rejected', 'warning_acknowledged')),
  previous_status text not null,
  new_status text not null,
  comments text null check (comments is null or char_length(comments) <= 4000),
  checklist_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists assessment_version_reviews_version_created_idx
  on public.assessment_version_reviews(assessment_version_id, created_at desc);
create index if not exists assessment_version_reviews_owner_created_idx
  on public.assessment_version_reviews(owner_profile_id, created_at desc);

alter table public.assessment_version_reviews enable row level security;

create policy institution_assessment_moderation_read on public.assessments
  for select to authenticated
  using (public.has_institution_permission(owner_profile_id, 'moderation'));

create policy institution_assessment_version_moderation_read on public.assessment_versions
  for select to authenticated
  using (
    public.has_institution_permission(
      (select assessment.owner_profile_id from public.assessments assessment where assessment.id = assessment_versions.assessment_id),
      'moderation'
    )
  );

create policy institution_version_review_read on public.assessment_version_reviews
  for select to authenticated
  using (
    public.has_institution_permission(owner_profile_id, 'assessment_authoring')
    or public.has_institution_permission(owner_profile_id, 'moderation')
  );

create or replace function public.review_assessment_version(
  p_version_id uuid,
  p_decision text,
  p_comments text default null,
  p_checklist_json jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_row public.assessment_versions%rowtype;
  target_owner_profile_id uuid;
  next_status text;
begin
  if p_decision not in ('reviewed', 'approved', 'rejected', 'warning_acknowledged') then
    raise exception 'Unsupported review decision';
  end if;
  if p_comments is not null and char_length(p_comments) > 4000 then
    raise exception 'Reviewer comments are too long';
  end if;

  select version.*
  into version_row
  from public.assessment_versions version
  where version.id = p_version_id
  for update;
  if version_row.id is null then raise exception 'Assessment version not found'; end if;

  select assessment.owner_profile_id
  into target_owner_profile_id
  from public.assessments assessment
  where assessment.id = version_row.assessment_id;
  if not public.has_institution_permission(target_owner_profile_id, 'moderation') then
    raise exception 'Institution moderation permission required';
  end if;
  if version_row.status in ('published', 'archived') then
    raise exception 'Published versions are frozen';
  end if;

  next_status := version_row.governance_status;
  if p_decision = 'reviewed' then
    if version_row.governance_status not in ('draft', 'reviewed') then
      raise exception 'Only a draft can enter review';
    end if;
    next_status := 'reviewed';
  elsif p_decision = 'approved' then
    if version_row.governance_status <> 'reviewed' then
      raise exception 'A version must be reviewed before approval';
    end if;
    next_status := 'approved';
  elsif p_decision = 'rejected' then
    if version_row.governance_status not in ('reviewed', 'approved') then
      raise exception 'Only a reviewed or approved version can be rejected';
    end if;
    if nullif(trim(coalesce(p_comments, '')), '') is null then
      raise exception 'Reviewer comments are required when returning a version to draft';
    end if;
    next_status := 'draft';
  end if;

  update public.assessment_versions
  set governance_status = next_status,
      requires_owner_review = (next_status <> 'approved')
  where id = p_version_id;

  insert into public.assessment_version_reviews (
    owner_profile_id, assessment_version_id, reviewer_profile_id, decision,
    previous_status, new_status, comments, checklist_json
  ) values (
    target_owner_profile_id, p_version_id, public.current_profile_id(), p_decision,
    version_row.governance_status, next_status, nullif(trim(coalesce(p_comments, '')), ''),
    coalesce(p_checklist_json, '{}'::jsonb)
  );

  return next_status;
end;
$$;

revoke all on function public.review_assessment_version(uuid, text, text, jsonb) from public;
revoke all on function public.review_assessment_version(uuid, text, text, jsonb) from anon;
grant execute on function public.review_assessment_version(uuid, text, text, jsonb) to authenticated;

comment on table public.assessment_version_reviews is
  'Append-only institution review, approval, rejection, and warning acknowledgement evidence.';
