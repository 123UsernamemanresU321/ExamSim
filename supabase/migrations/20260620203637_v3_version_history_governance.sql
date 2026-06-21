-- Immutable assessment version history and restore-as-draft workflow.

create or replace function public.clone_assessment_version_as_draft(p_source_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_version public.assessment_versions%rowtype;
  target_owner_profile_id uuid;
  new_version_id uuid := gen_random_uuid();
  next_version_no integer;
begin
  select version.*
  into source_version
  from public.assessment_versions version
  where version.id = p_source_version_id;

  if source_version.id is null then
    raise exception 'Assessment version not found';
  end if;

  select assessment.owner_profile_id
  into target_owner_profile_id
  from public.assessments assessment
  where assessment.id = source_version.assessment_id;

  if target_owner_profile_id is null then
    raise exception 'Assessment owner not found';
  end if;
  if not public.has_institution_permission(target_owner_profile_id, 'assessment_authoring') then
    raise exception 'Institution assessment authoring permission required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(source_version.assessment_id::text, 0));
  select coalesce(max(version_no), 0) + 1
  into next_version_no
  from public.assessment_versions
  where assessment_id = source_version.assessment_id;

  insert into public.assessment_versions (
    id, assessment_id, version_no, status, source_kind, source_object_path,
    normalized_package_path, normalized_package_json, parse_confidence,
    requires_owner_review, markscheme_html, markscheme_pdf_path,
    markscheme_source_kind, markscheme_source_object_path,
    encrypted_package_path, kms_provider, wrapped_data_key, encryption_metadata_json,
    published_at, created_at
  ) values (
    new_version_id, source_version.assessment_id, next_version_no, 'draft',
    source_version.source_kind, source_version.source_object_path,
    source_version.normalized_package_path, source_version.normalized_package_json,
    source_version.parse_confidence, true, source_version.markscheme_html,
    source_version.markscheme_pdf_path, source_version.markscheme_source_kind,
    source_version.markscheme_source_object_path, null, null, null, '{}'::jsonb,
    null, now()
  );

  create temporary table _clone_question_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;
  insert into _clone_question_map(old_id, new_id)
  select id, gen_random_uuid()
  from public.question_nodes
  where assessment_version_id = p_source_version_id;

  insert into public.question_nodes (
    id, assessment_version_id, parent_node_id, root_question_id, node_key,
    display_label, depth, ordinal_path, sort_key, ordinal, node_type, title,
    prompt_html, prompt_latex, marks, response_mode, interaction_json,
    markscheme_html, mark_mode, assets, source_page_start, source_page_end,
    source_region_json, has_visual_assets, visual_asset_refs, created_at
  )
  select
    question_map.new_id, new_version_id, parent_map.new_id, root_map.new_id,
    question.node_key, question.display_label, question.depth, question.ordinal_path,
    question.sort_key, question.ordinal, question.node_type, question.title,
    question.prompt_html, question.prompt_latex, question.marks,
    question.response_mode, question.interaction_json, question.markscheme_html,
    question.mark_mode, question.assets, question.source_page_start,
    question.source_page_end, question.source_region_json,
    question.has_visual_assets, question.visual_asset_refs, now()
  from public.question_nodes question
  join _clone_question_map question_map on question_map.old_id = question.id
  left join _clone_question_map parent_map on parent_map.old_id = question.parent_node_id
  left join _clone_question_map root_map on root_map.old_id = question.root_question_id
  where question.assessment_version_id = p_source_version_id;

  create temporary table _clone_source_document_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _clone_source_document_map(old_id, new_id)
  select id, gen_random_uuid() from public.source_documents where assessment_version_id = p_source_version_id;
  insert into public.source_documents (
    id, owner_profile_id, assessment_id, assessment_version_id, document_kind,
    source_kind, object_path, original_file_name, status, metadata_json, created_at, updated_at
  )
  select document_map.new_id, document.owner_profile_id, document.assessment_id,
    new_version_id, document.document_kind, document.source_kind, document.object_path,
    document.original_file_name, 'review_required',
    coalesce(document.metadata_json, '{}'::jsonb) || jsonb_build_object('cloned_from_source_document_id', document.id),
    now(), now()
  from public.source_documents document
  join _clone_source_document_map document_map on document_map.old_id = document.id
  where document.assessment_version_id = p_source_version_id;

  create temporary table _clone_source_page_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _clone_source_page_map(old_id, new_id)
  select page.id, gen_random_uuid()
  from public.source_pages page
  join public.source_documents document on document.id = page.source_document_id
  where document.assessment_version_id = p_source_version_id;
  insert into public.source_pages (
    id, source_document_id, page_number, width_points, height_points,
    image_object_path, text_preview, metadata_json, created_at
  )
  select page_map.new_id, document_map.new_id, page.page_number, page.width_points,
    page.height_points, page.image_object_path, page.text_preview, page.metadata_json, now()
  from public.source_pages page
  join _clone_source_page_map page_map on page_map.old_id = page.id
  join _clone_source_document_map document_map on document_map.old_id = page.source_document_id;

  insert into public.question_source_regions (
    assessment_version_id, question_node_id, source_document_id, source_page_id,
    region_type, node_key, bbox_json, confidence, status, metadata_json,
    created_at, updated_at
  )
  select new_version_id, question_map.new_id, document_map.new_id, page_map.new_id,
    region.region_type, region.node_key, region.bbox_json, region.confidence,
    'needs_review', region.metadata_json, now(), now()
  from public.question_source_regions region
  join _clone_source_document_map document_map on document_map.old_id = region.source_document_id
  left join _clone_source_page_map page_map on page_map.old_id = region.source_page_id
  left join _clone_question_map question_map on question_map.old_id = region.question_node_id
  where region.assessment_version_id = p_source_version_id;

  create temporary table _clone_markscheme_document_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _clone_markscheme_document_map(old_id, new_id)
  select id, gen_random_uuid() from public.markscheme_documents where assessment_version_id = p_source_version_id;
  insert into public.markscheme_documents (id, assessment_id, assessment_version_id, source_object_path, status, created_at)
  select map.new_id, document.assessment_id, new_version_id, document.source_object_path, 'review_required', now()
  from public.markscheme_documents document
  join _clone_markscheme_document_map map on map.old_id = document.id;
  insert into public.markscheme_nodes (
    markscheme_document_id, node_key, normalized_key, ordinal_path,
    mapped_question_node_id, markscheme_html, source_page_start, source_page_end,
    confidence, status, created_at
  )
  select document_map.new_id, node.node_key, node.normalized_key, node.ordinal_path,
    question_map.new_id, node.markscheme_html, node.source_page_start,
    node.source_page_end, node.confidence, 'needs_review', now()
  from public.markscheme_nodes node
  join _clone_markscheme_document_map document_map on document_map.old_id = node.markscheme_document_id
  left join _clone_question_map question_map on question_map.old_id = node.mapped_question_node_id;

  create temporary table _clone_rubric_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _clone_rubric_map(old_id, new_id)
  select id, gen_random_uuid() from public.rubrics where assessment_version_id = p_source_version_id;
  insert into public.rubrics (id, assessment_version_id, owner_profile_id, title, total_marks, created_at, updated_at)
  select map.new_id, new_version_id, rubric.owner_profile_id, rubric.title, rubric.total_marks, now(), now()
  from public.rubrics rubric
  join _clone_rubric_map map on map.old_id = rubric.id;
  insert into public.rubric_criteria (
    rubric_id, question_node_id, ordinal, label, description, max_marks, created_at
  )
  select rubric_map.new_id, question_map.new_id, criteria.ordinal, criteria.label,
    criteria.description, criteria.max_marks, now()
  from public.rubric_criteria criteria
  join _clone_rubric_map rubric_map on rubric_map.old_id = criteria.rubric_id
  left join _clone_question_map question_map on question_map.old_id = criteria.question_node_id;

  insert into public.question_topic_links (question_node_id, topic_tag_id, weight, created_at)
  select question_map.new_id, topic.topic_tag_id, topic.weight, now()
  from public.question_topic_links topic
  join _clone_question_map question_map on question_map.old_id = topic.question_node_id;

  return new_version_id;
end;
$$;

revoke all on function public.clone_assessment_version_as_draft(uuid) from public;
revoke all on function public.clone_assessment_version_as_draft(uuid) from anon;
grant execute on function public.clone_assessment_version_as_draft(uuid) to authenticated;

comment on function public.clone_assessment_version_as_draft(uuid) is
  'Clones a frozen or historical assessment version into a new review-required draft while remapping question-owned records.';
