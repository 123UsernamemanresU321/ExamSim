"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { computeGeneratedPaperHealth, selectQuestionBankItems } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, QuestionBankChild, QuestionBankItem } from "@/types/database";

export async function replaceGeneratedPaperQuestionAction(paperId: string, generatedPaperItemId: string) {
  const { ownerProfileId } = await requireInstitutionPermission("assessment_authoring");
  const supabase = await createSupabaseServerClient();
  const paper = await requireOwnedPaper(supabase, paperId, ownerProfileId);
  const { data: paperItems, error: paperItemsError } = await supabase.from("generated_paper_items").select("*").eq("generated_paper_id", paper.id).order("ordinal");
  if (paperItemsError) throw paperItemsError;
  const target = paperItems?.find((item) => item.id === generatedPaperItemId);
  if (!target) throw new Error("Generated paper question not found.");
  const selectedIds = (paperItems ?? []).map((item) => item.question_bank_item_id);
  const { data: candidates, error: candidateError } = await supabase
    .from("question_bank_items")
    .select("*")
    .eq("owner_profile_id", ownerProfileId)
    .eq("do_not_reuse", false)
    .eq("readiness_status", "ready");
  if (candidateError) throw candidateError;
  const criteria = readRecord(paper.criteria_json);
  const selection = selectQuestionBankItems((candidates ?? []) as QuestionBankItem[], {
    subject: typeof criteria.subject === "string" ? criteria.subject : paper.subject,
    topicTags: stringArray(criteria.topicTags),
    targetMarks: Number(target.included_marks ?? 0) || null,
    difficultyMin: optionalNumber(criteria.difficultyMin),
    difficultyMax: optionalNumber(criteria.difficultyMax),
    commandTerms: stringArray(criteria.commandTerms),
    paperTypes: stringArray(criteria.paperTypes),
    standardIds: stringArray(criteria.standardIds),
    avoidQuestionIds: selectedIds,
    includeVisualQuestions: true,
  });
  const replacement = selection.selectedItems[0];
  if (!replacement) throw new Error("No unused ready question matches this blueprint. Broaden the criteria or review more library questions.");
  const { error: updateError } = await supabase.from("generated_paper_items").update({
    question_bank_item_id: replacement.id,
    included_marks: replacement.marks_available,
  }).eq("id", target.id).eq("generated_paper_id", paper.id);
  if (updateError) throw updateError;
  await refreshPaperHealth(supabase, paper.id, paper.target_marks);
  await auditInstitutionAction({ ownerProfileId, action: "generated_paper.question_replaced", targetTable: "generated_papers", targetId: paper.id, metadata: { previous_question_id: target.question_bank_item_id, replacement_question_id: replacement.id } });
  revalidatePath(`/owner/paper-generator/${paper.id}`);
}

export async function convertGeneratedPaperToAssessmentAction(paperId: string) {
  const { ownerProfileId } = await requireInstitutionPermission("assessment_authoring");
  const supabase = await createSupabaseServerClient();
  const paper = await requireOwnedPaper(supabase, paperId, ownerProfileId);
  if (paper.status !== "draft") throw new Error("Only draft generated papers can be converted.");
  const { data: paperItems, error: paperItemsError } = await supabase.from("generated_paper_items").select("*").eq("generated_paper_id", paper.id).order("ordinal");
  if (paperItemsError) throw paperItemsError;
  const questionIds = (paperItems ?? []).map((item) => item.question_bank_item_id);
  const [{ data: questions, error: questionError }, { data: children, error: childError }] = await Promise.all([
    questionIds.length ? supabase.from("question_bank_items").select("*").in("id", questionIds).eq("owner_profile_id", ownerProfileId) : { data: [], error: null },
    questionIds.length ? supabase.from("question_bank_children").select("*").in("question_bank_item_id", questionIds) : { data: [], error: null },
  ]);
  if (questionError) throw questionError;
  if (childError) throw childError;
  const questionById = new Map(((questions ?? []) as QuestionBankItem[]).map((question) => [question.id, question]));
  const selectedQuestions = (paperItems ?? []).map((item) => questionById.get(item.question_bank_item_id)).filter((item): item is QuestionBankItem => Boolean(item));
  const health = computeGeneratedPaperHealth(selectedQuestions, paper.target_marks);
  if (health.blockers.length) throw new Error(`Blueprint health blockers: ${health.blockers.join(" ")}`);

  const { data: assessment, error: assessmentError } = await supabase.from("assessments").insert({
    owner_profile_id: ownerProfileId,
    title: paper.title,
    assessment_kind: "exam",
    description: "Draft created from a reviewed Question Library blueprint.",
    default_timezone: "Africa/Johannesburg",
  }).select("id").single();
  if (assessmentError) throw assessmentError;
  if (!assessment) throw new Error("Assessment draft could not be created.");
  const { data: version, error: versionError } = await supabase.from("assessment_versions").insert({
    assessment_id: assessment.id,
    version_no: 1,
    status: "draft",
    governance_status: "draft",
    source_kind: "json",
    normalized_package_json: null,
    parse_confidence: 1,
    requires_owner_review: true,
  }).select("id").single();
  if (versionError) throw versionError;
  if (!version) throw new Error("Assessment version draft could not be created.");
  const assessmentId = assessment.id;
  const versionId = version.id;

  const childrenByItem = new Map<string, QuestionBankChild[]>();
  for (const child of (children ?? []) as QuestionBankChild[]) childrenByItem.set(child.question_bank_item_id, [...(childrenByItem.get(child.question_bank_item_id) ?? []), child]);
  const sourceDocumentByPath = new Map<string, string>();
  const sourcePageByPathAndNumber = new Map<string, string>();
  const newNodeIdBySourceQuestionId = new Map<string, string>();
  const rubricDrafts: Array<{ questionNodeId: string | null; ordinal: number; label: string; description: string | null; maxMarks: number }> = [];

  async function attachSourceRegions(input: {
    objectPath: string | null;
    pageStart: number | null;
    pageEnd: number | null;
    regionJson: Json | null;
    questionNodeId: string;
    nodeKey: string;
  }) {
    if (!input.objectPath) return;
    let sourceDocumentId = sourceDocumentByPath.get(input.objectPath);
    if (!sourceDocumentId) {
      const { data: document, error: documentError } = await supabase.from("source_documents").insert({
        owner_profile_id: ownerProfileId,
        assessment_id: assessmentId,
        assessment_version_id: versionId,
        document_kind: "question_paper",
        source_kind: "pdf",
        object_path: input.objectPath,
        original_file_name: input.objectPath.split("/").pop() ?? "source.pdf",
        status: "approved",
        metadata_json: { generated_from_question_library: true },
      }).select("id").single();
      if (documentError) throw documentError;
      if (!document) throw new Error("Source document could not be created.");
      sourceDocumentId = document.id;
      sourceDocumentByPath.set(input.objectPath, sourceDocumentId);
    }
    const regionRecords = jsonArray(input.regionJson);
    const pageNumbers = new Set<number>();
    if (input.pageStart && input.pageStart > 0) {
      const end = input.pageEnd && input.pageEnd >= input.pageStart ? input.pageEnd : input.pageStart;
      for (let page = input.pageStart; page <= Math.min(end, input.pageStart + 100); page += 1) pageNumbers.add(page);
    }
    for (const region of regionRecords) {
      const pageNumber = Number(region.page_number ?? 0);
      if (Number.isInteger(pageNumber) && pageNumber > 0) pageNumbers.add(pageNumber);
    }
    for (const pageNumber of pageNumbers) {
      const key = `${input.objectPath}:${pageNumber}`;
      if (sourcePageByPathAndNumber.has(key)) continue;
      const { data: sourcePage, error: pageError } = await supabase.from("source_pages").upsert({
        source_document_id: sourceDocumentId,
        page_number: pageNumber,
        metadata_json: { generated_from_question_library: true },
      }, { onConflict: "source_document_id,page_number" }).select("id").single();
      if (pageError) throw pageError;
      if (!sourcePage) throw new Error("Source page could not be created.");
      sourcePageByPathAndNumber.set(key, sourcePage.id);
    }
    if (!regionRecords.length && input.pageStart) {
      regionRecords.push({ region_type: "question", bbox_json: { x: 0, y: 0, width: 1, height: 1 }, page_number: input.pageStart, confidence: 1, status: "approved", metadata_json: { page_anchor_only: true } });
    }
    if (regionRecords.length) {
      const { error: regionError } = await supabase.from("question_source_regions").insert(regionRecords.map((region) => {
        const pageNumber = Number(region.page_number ?? input.pageStart ?? 0);
        return {
          assessment_version_id: versionId,
          question_node_id: input.questionNodeId,
          source_document_id: sourceDocumentId,
          source_page_id: pageNumber > 0 ? sourcePageByPathAndNumber.get(`${input.objectPath}:${pageNumber}`) ?? null : null,
          region_type: normalizeRegionType(region.region_type),
          node_key: input.nodeKey,
          bbox_json: readRecord(region.bbox_json) as Json,
          confidence: optionalNumber(region.confidence),
          status: normalizeRegionStatus(region.status),
          metadata_json: { ...readRecord(region.metadata_json), generated_from_question_library: true },
        };
      }));
      if (regionError) throw regionError;
    }
  }

  for (let index = 0; index < (paperItems ?? []).length; index += 1) {
    const paperItem = paperItems![index];
    const question = questionById.get(paperItem.question_bank_item_id);
    if (!question) continue;
    const rootKey = String(index + 1);
    const { data: rootNode, error: rootError } = await supabase.from("question_nodes").insert({
      assessment_version_id: versionId,
      parent_node_id: null,
      node_key: rootKey,
      ordinal: index + 1,
      node_type: "question",
      title: question.title,
      prompt_html: question.prompt_html,
      prompt_latex: question.prompt_latex,
      marks: question.marks_available,
      response_mode: question.answer_mode,
      interaction_json: question.interaction_json,
      source_page_start: question.source_page_start,
      source_page_end: question.source_page_end,
    }).select("id").single();
    if (rootError) throw rootError;
    if (question.source_question_node_id) newNodeIdBySourceQuestionId.set(question.source_question_node_id, rootNode.id);
    if (question.topic_tag_ids.length) {
      const { error: topicError } = await supabase.from("question_topic_links").insert(question.topic_tag_ids.map((topicTagId) => ({ question_node_id: rootNode.id, topic_tag_id: topicTagId, weight: 1 })));
      if (topicError) throw topicError;
    }
    if (question.curriculum_standard_ids.length) {
      const { error: standardError } = await supabase.from("question_standard_links").insert(question.curriculum_standard_ids.map((standardId) => ({ owner_profile_id: ownerProfileId, question_node_id: rootNode.id, curriculum_standard_id: standardId, weight: 1 })));
      if (standardError) throw standardError;
    }
    await attachSourceRegions({ objectPath: question.source_pdf_object_path, pageStart: question.source_page_start, pageEnd: question.source_page_end, regionJson: question.source_region_json, questionNodeId: rootNode.id, nodeKey: rootKey });
    const nodeIdByOriginalKey = new Map<string, string>([[question.root_node_key, rootNode.id]]);
    const itemChildren = [...(childrenByItem.get(question.id) ?? [])].sort((a, b) => comparePath(a.ordinal_path, b.ordinal_path));
    for (let childIndex = 0; childIndex < itemChildren.length; childIndex += 1) {
      const child = itemChildren[childIndex];
      const mappedKey = remapNodeKey(child.node_key, question.root_node_key, rootKey);
      const mappedParentKey = child.parent_node_key ? remapNodeKey(child.parent_node_key, question.root_node_key, rootKey) : rootKey;
      const { data: childNode, error: childInsertError } = await supabase.from("question_nodes").insert({
        assessment_version_id: versionId,
        parent_node_id: nodeIdByOriginalKey.get(mappedParentKey) ?? rootNode.id,
        node_key: mappedKey,
        ordinal: childIndex + 1,
        node_type: "part",
        prompt_html: child.prompt_html,
        prompt_latex: child.prompt_latex,
        marks: child.marks_available,
        response_mode: child.response_mode,
        interaction_json: child.interaction_json,
      }).select("id").single();
      if (childInsertError) throw childInsertError;
      nodeIdByOriginalKey.set(mappedKey, childNode.id);
      if (child.source_question_node_id) newNodeIdBySourceQuestionId.set(child.source_question_node_id, childNode.id);
      await attachSourceRegions({ objectPath: question.source_pdf_object_path, pageStart: question.source_page_start, pageEnd: question.source_page_end, regionJson: child.source_region_json, questionNodeId: childNode.id, nodeKey: mappedKey });
    }
    for (const criterion of jsonArray(question.rubric_json)) {
      const sourceQuestionId = typeof criterion.question_node_id === "string" ? criterion.question_node_id : null;
      rubricDrafts.push({
        questionNodeId: sourceQuestionId ? newNodeIdBySourceQuestionId.get(sourceQuestionId) ?? rootNode.id : rootNode.id,
        ordinal: Number(criterion.ordinal ?? rubricDrafts.length + 1),
        label: String(criterion.label ?? "Rubric point").slice(0, 300),
        description: typeof criterion.description === "string" ? criterion.description.slice(0, 2000) : null,
        maxMarks: Math.max(0, Number(criterion.max_marks ?? 0)),
      });
    }
  }
  if (rubricDrafts.length) {
    const totalMarks = rubricDrafts.reduce((sum, criterion) => sum + criterion.maxMarks, 0);
    const { data: rubric, error: rubricError } = await supabase.from("rubrics").insert({ owner_profile_id: ownerProfileId, assessment_version_id: versionId, title: "Generated blueprint rubric", total_marks: totalMarks }).select("id").single();
    if (rubricError) throw rubricError;
    const { error: criteriaError } = await supabase.from("rubric_criteria").insert(rubricDrafts.map((criterion, index) => ({
      rubric_id: rubric.id,
      question_node_id: criterion.questionNodeId,
      ordinal: index + 1,
      label: criterion.label,
      description: criterion.description,
      max_marks: criterion.maxMarks,
    })));
    if (criteriaError) throw criteriaError;
  }

  const { error: paperUpdateError } = await supabase.from("generated_papers").update({ status: "converted_to_assessment", converted_assessment_id: assessmentId, readiness_score: health.score, health_warnings_json: health.warnings }).eq("id", paper.id).eq("owner_profile_id", ownerProfileId);
  if (paperUpdateError) throw paperUpdateError;
  await auditInstitutionAction({ ownerProfileId, action: "generated_paper.converted", targetTable: "generated_papers", targetId: paper.id, metadata: { assessment_id: assessmentId, assessment_version_id: versionId } });
  redirect(`/owner/assessments/${assessmentId}/authoring`);
}

async function requireOwnedPaper(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, paperId: string, ownerProfileId: string) {
  const { data, error } = await supabase.from("generated_papers").select("*").eq("id", paperId).eq("owner_profile_id", ownerProfileId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Generated paper not found in this institution.");
  return data;
}

async function refreshPaperHealth(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, paperId: string, targetMarks: number | null) {
  const { data: rows, error: rowError } = await supabase.from("generated_paper_items").select("question_bank_item_id").eq("generated_paper_id", paperId);
  if (rowError) throw rowError;
  const ids = (rows ?? []).map((row) => row.question_bank_item_id);
  const { data: questions, error: questionError } = ids.length ? await supabase.from("question_bank_items").select("*").in("id", ids) : { data: [], error: null };
  if (questionError) throw questionError;
  const health = computeGeneratedPaperHealth((questions ?? []) as QuestionBankItem[], targetMarks);
  const { error } = await supabase.from("generated_papers").update({ readiness_score: health.score, health_warnings_json: [...health.blockers, ...health.warnings] as Json }).eq("id", paperId);
  if (error) throw error;
}

function remapNodeKey(original: string, sourceRoot: string, targetRoot: string) {
  if (original === sourceRoot) return targetRoot;
  const suffix = original.startsWith(`${sourceRoot}.`) ? original.slice(sourceRoot.length) : `.${original}`;
  return `${targetRoot}${suffix}`;
}

function comparePath(a: number[], b: number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? -1) - (b[index] ?? -1);
    if (delta) return delta;
  }
  return 0;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function optionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function jsonArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function normalizeRegionType(value: unknown) {
  const allowed = ["question", "subquestion", "diagram", "table", "answer_area", "markscheme", "instructions", "other"] as const;
  return allowed.includes(value as (typeof allowed)[number]) ? value as (typeof allowed)[number] : "question";
}

function normalizeRegionStatus(value: unknown) {
  const allowed = ["detected", "approved", "needs_review", "ignored"] as const;
  return allowed.includes(value as (typeof allowed)[number]) ? value as (typeof allowed)[number] : "needs_review";
}
