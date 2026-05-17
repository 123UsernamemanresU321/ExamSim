-- Question hierarchy hardening and root-question upload slot generation.

alter table public.question_nodes
  add column if not exists root_question_id uuid references public.question_nodes(id) on delete set null,
  add column if not exists display_label text,
  add column if not exists depth integer check (depth is null or depth >= 0),
  add column if not exists ordinal_path integer[],
  add column if not exists sort_key text,
  add column if not exists mark_mode text not null default 'manual' check (mark_mode in ('manual', 'computed')),
  add column if not exists source_region_json jsonb not null default '{}'::jsonb,
  add column if not exists has_visual_assets boolean not null default false,
  add column if not exists visual_asset_refs text[] not null default '{}'::text[];

with recursive tree as (
  select
    q.id,
    q.id as root_question_id,
    0 as depth,
    array[q.ordinal]::integer[] as ordinal_path
  from public.question_nodes q
  where q.parent_node_id is null

  union all

  select
    child.id,
    tree.root_question_id,
    tree.depth + 1,
    tree.ordinal_path || child.ordinal
  from public.question_nodes child
  join tree on tree.id = child.parent_node_id
)
update public.question_nodes q
set
  root_question_id = coalesce(q.root_question_id, tree.root_question_id),
  depth = coalesce(q.depth, tree.depth),
  ordinal_path = coalesce(q.ordinal_path, tree.ordinal_path),
  display_label = coalesce(q.display_label, q.node_key),
  sort_key = coalesce(q.sort_key, array_to_string(tree.ordinal_path, '.')),
  mark_mode = case
    when exists (select 1 from public.question_nodes child where child.parent_node_id = q.id) then 'computed'
    else q.mark_mode
  end,
  has_visual_assets = coalesce(array_length(q.assets, 1), 0) > 0,
  visual_asset_refs = coalesce(q.assets, '{}'::text[])
from tree
where q.id = tree.id;

create index if not exists question_nodes_version_ordinal_path_idx
  on public.question_nodes using gin (ordinal_path);

create index if not exists question_nodes_root_question_idx
  on public.question_nodes(root_question_id);

drop function if exists public.create_upload_slots_for_attempt(uuid);

create or replace function public.create_upload_slots_for_attempt(target_attempt_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.upload_slots (attempt_id, question_node_id, required, status)
  select a.id, root.id, a.require_blank_for_skipped, 'pending'
  from public.attempts a
  join public.question_nodes root on root.assessment_version_id = a.assessment_version_id
  left join public.question_nodes parent on parent.id = root.parent_node_id
  where a.id = target_attempt_id
    and root.node_type = 'question'
    and (root.parent_node_id is null or parent.node_type = 'section')
  on conflict (attempt_id, question_node_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

comment on function public.create_upload_slots_for_attempt(uuid) is
  'Creates one answer upload slot per root/main question only; subquestions and deeper parts never receive separate student upload slots.';
