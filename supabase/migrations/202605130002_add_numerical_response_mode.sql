alter table public.question_nodes
  drop constraint if exists question_nodes_response_mode_check;

alter table public.question_nodes
  add constraint question_nodes_response_mode_check
  check (response_mode in ('none', 'typed_text', 'upload_pdf', 'typed_or_upload', 'multiple_choice', 'numerical'));

create or replace function public.replace_question_tree_for_version(
  p_version_id uuid,
  p_nodes jsonb,
  p_package_json jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_node_count integer;
  v_status text;
  v_problem text;
begin
  if p_version_id is null then
    raise exception 'version_id is required';
  end if;
  if jsonb_typeof(p_nodes) <> 'array' or jsonb_array_length(p_nodes) = 0 then
    raise exception 'nodes are required';
  end if;

  select status into v_status
  from public.assessment_versions
  where id = p_version_id
  for update;

  if v_status is null then
    raise exception 'assessment version not found';
  end if;
  if v_status = 'published' then
    raise exception 'published assessment versions are immutable';
  end if;

  drop table if exists pg_temp.ev_review_nodes;
  drop table if exists pg_temp.ev_inserted_review_nodes;

  create temporary table ev_review_nodes (
    node_key text not null,
    parent_node_key text null,
    ordinal integer not null,
    node_type text not null,
    title text null,
    prompt_html text null,
    prompt_latex text null,
    marks numeric null,
    response_mode text not null,
    interaction_json jsonb null,
    source_page_start integer null,
    source_page_end integer null
  ) on commit drop;

  insert into ev_review_nodes (
    node_key,
    parent_node_key,
    ordinal,
    node_type,
    title,
    prompt_html,
    prompt_latex,
    marks,
    response_mode,
    interaction_json,
    source_page_start,
    source_page_end
  )
  select
    nullif(trim(node_key), ''),
    nullif(trim(parent_node_key), ''),
    ordinal,
    node_type,
    title,
    prompt_html,
    prompt_latex,
    marks,
    response_mode,
    interaction_json,
    source_page_start,
    source_page_end
  from jsonb_to_recordset(p_nodes) as node(
    node_key text,
    parent_node_key text,
    ordinal integer,
    node_type text,
    title text,
    prompt_html text,
    prompt_latex text,
    marks numeric,
    response_mode text,
    interaction_json jsonb,
    source_page_start integer,
    source_page_end integer
  );

  if exists (select 1 from ev_review_nodes where node_key is null) then
    raise exception 'every node requires a node_key';
  end if;
  if exists (select 1 from ev_review_nodes where ordinal is null) then
    raise exception 'every node requires an ordinal';
  end if;
  if exists (select 1 from ev_review_nodes where node_type not in ('section', 'question', 'subquestion', 'part')) then
    raise exception 'invalid node_type in question tree';
  end if;
  if exists (select 1 from ev_review_nodes where response_mode not in ('none', 'typed_text', 'upload_pdf', 'typed_or_upload', 'multiple_choice', 'numerical')) then
    raise exception 'invalid response_mode in question tree';
  end if;
  if exists (select 1 from ev_review_nodes where marks is not null and marks < 0) then
    raise exception 'marks must be zero or greater';
  end if;

  select node_key into v_problem
  from ev_review_nodes
  group by node_key
  having count(*) > 1
  limit 1;
  if v_problem is not null then
    raise exception 'duplicate node_key "%"', v_problem;
  end if;

  select child.node_key into v_problem
  from ev_review_nodes child
  left join ev_review_nodes parent on parent.node_key = child.parent_node_key
  where child.parent_node_key is not null
    and (child.parent_node_key = child.node_key or parent.node_key is null)
  limit 1;
  if v_problem is not null then
    raise exception 'invalid parent_node_key for node "%"', v_problem;
  end if;

  with recursive walk as (
    select
      node_key,
      parent_node_key,
      array[node_key] as path,
      false as cycle
    from ev_review_nodes
    union all
    select
      walk.node_key,
      parent.parent_node_key,
      walk.path || parent.node_key,
      parent.node_key = any(walk.path)
    from walk
    join ev_review_nodes parent on parent.node_key = walk.parent_node_key
    where walk.parent_node_key is not null
      and not walk.cycle
  )
  select node_key into v_problem
  from walk
  where cycle
  limit 1;
  if v_problem is not null then
    raise exception 'question tree contains a parent cycle involving "%"', v_problem;
  end if;

  delete from public.question_nodes
  where assessment_version_id = p_version_id;

  create temporary table ev_inserted_review_nodes (
    id uuid not null,
    node_key text not null
  ) on commit drop;

  with inserted as (
    insert into public.question_nodes (
      assessment_version_id,
      node_key,
      ordinal,
      node_type,
      title,
      prompt_html,
      prompt_latex,
      marks,
      response_mode,
      interaction_json,
      source_page_start,
      source_page_end
    )
    select
      p_version_id,
      node_key,
      ordinal,
      node_type,
      title,
      prompt_html,
      prompt_latex,
      marks,
      response_mode,
      interaction_json,
      source_page_start,
      source_page_end
    from ev_review_nodes
    order by ordinal, node_key
    returning id, node_key
  )
  insert into ev_inserted_review_nodes(id, node_key)
  select id, node_key
  from inserted;

  update public.question_nodes child
  set parent_node_id = parent.id
  from ev_inserted_review_nodes child_inserted
  join ev_review_nodes review_node on review_node.node_key = child_inserted.node_key
  join ev_inserted_review_nodes parent on parent.node_key = review_node.parent_node_key
  where child.id = child_inserted.id;

  update public.assessment_versions
  set
    requires_owner_review = false,
    status = 'draft',
    normalized_package_json = p_package_json
  where id = p_version_id;

  select count(*) into v_node_count from ev_review_nodes;
  return v_node_count;
end;
$$;

revoke all on function public.replace_question_tree_for_version(uuid, jsonb, jsonb) from public;
revoke all on function public.replace_question_tree_for_version(uuid, jsonb, jsonb) from anon;
revoke all on function public.replace_question_tree_for_version(uuid, jsonb, jsonb) from authenticated;
grant execute on function public.replace_question_tree_for_version(uuid, jsonb, jsonb) to service_role;
