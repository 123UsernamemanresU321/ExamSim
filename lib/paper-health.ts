import { buildMarkingTree, calculateAttemptTotal, flattenMarkingTree, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { compareOrdinalPaths, detectVisualDependency, validateQuestionTree, type NormalizedQuestionHierarchyNode } from "@/lib/question-hierarchy";
import type { Assessment, AssessmentVersion, MarkschemeNode, QuestionNodeRow, QuestionSourceRegion, SourceDocument, UploadSlot } from "@/types/database";

export type PaperHealthStatus = "ready" | "warning" | "blocked" | "not_checked";

export type PaperHealthItem = {
  code: string;
  severity: Exclude<PaperHealthStatus, "ready" | "not_checked">;
  message: string;
  fixHref?: string;
};

export type PaperHealthSummary = {
  status: PaperHealthStatus;
  score: number;
  blockers: PaperHealthItem[];
  warnings: PaperHealthItem[];
  checks: Record<string, PaperHealthStatus>;
};

export function computePaperHealth({
  assessment,
  version,
  questionNodes,
  markschemeNodes = [],
  uploadSlots = [],
  sourceDocuments = [],
  sourceRegions = [],
}: {
  assessment?: Pick<Assessment, "id" | "title" | "paper_code"> | null;
  version?: Pick<AssessmentVersion, "id" | "status" | "source_object_path" | "markscheme_pdf_path" | "markscheme_source_object_path"> | null;
  questionNodes: QuestionNodeRow[];
  markschemeNodes?: Pick<MarkschemeNode, "status" | "mapped_question_node_id">[];
  uploadSlots?: Pick<UploadSlot, "question_node_id">[];
  sourceDocuments?: Pick<SourceDocument, "id" | "status" | "object_path" | "metadata_json">[];
  sourceRegions?: Pick<QuestionSourceRegion, "id" | "question_node_id" | "source_document_id" | "source_page_id" | "region_type" | "node_key" | "bbox_json" | "confidence" | "status" | "metadata_json">[];
}): PaperHealthSummary {
  const blockers: PaperHealthItem[] = [];
  const warnings: PaperHealthItem[] = [];
  const checks: Record<string, PaperHealthStatus> = {
    structure: "not_checked",
    source: "not_checked",
    markscheme: "not_checked",
    delivery: "not_checked",
    marking: "not_checked",
    security: "ready",
  };

  const tree = buildMarkingTree(questionNodes);
  const roots = getSelectableMarkingGroups(tree);
  const flat = flattenMarkingTree(tree);
  const flatById = new Map(flat.map((node) => [node.id, node]));

  if (!assessment) {
    blockers.push({ code: "assessment_missing", severity: "blocked", message: "Assessment metadata could not be loaded." });
  }

  if (!version) {
    blockers.push({ code: "version_missing", severity: "blocked", message: "No assessment version is available for health checking." });
  }

  if (!roots.length) {
    blockers.push({
      code: "no_root_questions",
      severity: "blocked",
      message: "No root questions were detected. Review the parser output before publishing.",
      fixHref: assessment ? `/owner/assessments/${assessment.id}/review` : undefined,
    });
  }

  const duplicateKeys = duplicateValues(flat.map((node) => node.node_key));
  for (const key of duplicateKeys) {
    blockers.push({ code: "duplicate_node_key", severity: "blocked", message: `Duplicate question key ${key} must be merged or renamed.` });
  }

  const paths = flat.map((node) => node.ordinal_path_resolved);
  for (let index = 1; index < paths.length; index += 1) {
    if (compareOrdinalPaths(paths[index - 1]!, paths[index]!) > 0) {
      blockers.push({ code: "invalid_order", severity: "blocked", message: "Question ordering is not a valid natural preorder traversal." });
      break;
    }
  }

  const attemptedTotal = calculateAttemptTotal(tree, []);
  if (attemptedTotal.max <= 0) {
    warnings.push({
      code: "marks_missing",
      severity: "warning",
      message: "No total marks were detected. Use the markscheme mapper or parse review to assign marks.",
      fixHref: assessment ? `/owner/assessments/${assessment.id}/review` : undefined,
    });
  }

  const rootSlotIds = new Set(uploadSlots.map((slot) => slot.question_node_id));
  const nonRootSlot = flat.find((node) => rootSlotIds.has(node.id) && !roots.some((root) => root.id === node.id));
  if (nonRootSlot) {
    blockers.push({
      code: "non_root_upload_slot",
      severity: "blocked",
      message: `Upload slot belongs to ${nonRootSlot.node_key}; upload slots must belong only to main questions.`,
    });
  }

  const sourceMissing = !version?.source_object_path;
  if (sourceMissing) {
    warnings.push({ code: "source_missing", severity: "warning", message: "No source object path is recorded for this version." });
  }

  const missingPageRoots = roots.filter((node) => !node.source_page_start || !node.source_page_end);
  if (missingPageRoots.length) {
    warnings.push({
      code: "source_page_ranges_missing",
      severity: "warning",
      message: `${missingPageRoots.length} root question(s) need source page ranges for reliable diagram/table fallback.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/review` : undefined,
    });
  }

  const visualMissing = flat.filter((node) => detectVisualDependency(node.prompt_html, node.prompt_latex) && !node.has_visual_assets && !node.source_page_start);
  if (visualMissing.length) {
    warnings.push({
      code: "visual_dependency_missing_source",
      severity: "warning",
      message: `${visualMissing.length} question node(s) mention diagrams, graphs, tables, or figures without visual source context.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/review` : undefined,
    });
  }

  const failedSourceDocuments = sourceDocuments.filter((document) => {
    const metadata = safeRecord(document.metadata_json);
    return document.status === "failed" || metadata.processing_status === "failed";
  });
  if (failedSourceDocuments.length) {
    warnings.push({
      code: "source_document_failed",
      severity: "warning",
      message: `${failedSourceDocuments.length} source document(s) failed page processing and need replacement or manual review.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/authoring#pdf-region-editor` : undefined,
    });
  }

  const activeSourceRegions = sourceRegions.filter((region) => region.status !== "ignored");
  const questionSourceRegionLinks = new Set(activeSourceRegions.map((region) => region.question_node_id).filter(Boolean));
  const missingQuestionSourceRegions = sourceDocuments.length
    ? flat.filter((node) => !questionSourceRegionLinks.has(node.id) && !node.source_region_json)
    : [];
  if (missingQuestionSourceRegions.length) {
    warnings.push({
      code: "question_source_regions_missing",
      severity: "warning",
      message: `${missingQuestionSourceRegions.length} question node(s) do not have PDF source regions yet.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/authoring#pdf-region-editor` : undefined,
    });
  }

  const unlinkedSourceRegions = activeSourceRegions.filter((region) => !region.question_node_id && ["question", "subquestion", "answer_area"].includes(region.region_type));
  if (unlinkedSourceRegions.length) {
    warnings.push({
      code: "source_region_unlinked",
      severity: "warning",
      message: `${unlinkedSourceRegions.length} question_source_regions box(es) are not linked to question cards.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/authoring#pdf-region-editor` : undefined,
    });
  }

  const lowConfidenceSourceRegions = activeSourceRegions.filter((region) => region.status === "detected" || region.status === "needs_review" || Number(region.confidence ?? 1) < 0.8);
  if (lowConfidenceSourceRegions.length) {
    warnings.push({
      code: "source_region_low_confidence",
      severity: "warning",
      message: `${lowConfidenceSourceRegions.length} PDF region(s) need owner review before the source map is trustworthy.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/authoring#pdf-region-editor` : undefined,
    });
  }

  const markBearingRegionTypes = new Set(["question", "subquestion", "answer_area"]);
  const missingMarksRegions = activeSourceRegions.filter((region) => {
    if (!markBearingRegionTypes.has(region.region_type)) return false;
    const linkedNode = region.question_node_id ? flatById.get(region.question_node_id) : null;
    const metadata = safeRecord(region.metadata_json);
    return !hasNumericValue(linkedNode?.marks) && !hasNumericValue(metadata.marks);
  });
  if (missingMarksRegions.length) {
    warnings.push({
      code: "source_region_missing_marks",
      severity: "warning",
      message: `${missingMarksRegions.length} question region(s) are missing marks on both the region and linked question.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/authoring#pdf-region-editor` : undefined,
    });
  }

  const missingResponseTypeRegions = activeSourceRegions.filter((region) => {
    if (!markBearingRegionTypes.has(region.region_type)) return false;
    const linkedNode = region.question_node_id ? flatById.get(region.question_node_id) : null;
    const metadata = safeRecord(region.metadata_json);
    const regionResponseMode = typeof metadata.response_mode === "string" ? metadata.response_mode : "";
    return !regionResponseMode && (!linkedNode?.response_mode || linkedNode.response_mode === "none");
  });
  if (missingResponseTypeRegions.length) {
    warnings.push({
      code: "source_region_missing_response_type",
      severity: "warning",
      message: `${missingResponseTypeRegions.length} question region(s) need a response type or a linked question with one.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/authoring#pdf-region-editor` : undefined,
    });
  }

  const overlappingRegions = findOverlappingSourceRegions(activeSourceRegions);
  if (overlappingRegions.length) {
    warnings.push({
      code: "source_region_overlap",
      severity: "warning",
      message: `${overlappingRegions.length} PDF source region overlap(s) may need split, merge, or review.`,
      fixHref: assessment ? `/owner/assessments/${assessment.id}/authoring#pdf-region-editor` : undefined,
    });
  }

  const markschemeRequired = Boolean(version?.markscheme_pdf_path || version?.markscheme_source_object_path || markschemeNodes.length);
  if (markschemeRequired) {
    const unmatched = markschemeNodes.filter((node) => node.status === "unmatched" || node.status === "needs_review");
    if (unmatched.length) {
      warnings.push({
        code: "unmatched_markscheme",
        severity: "warning",
        message: `${unmatched.length} markscheme section(s) still need mapping or review.`,
        fixHref: assessment ? `/owner/assessments/${assessment.id}/markscheme` : undefined,
      });
    }
  }

  const normalizedTreeIssues = validateQuestionTree(markingTreeToNormalized(roots));
  for (const issue of normalizedTreeIssues) {
    const item = { code: issue.code, severity: issue.severity, message: issue.message };
    if (issue.severity === "blocked") blockers.push(item);
    else warnings.push(item);
  }

  checks.structure = blockers.some((item) => ["no_root_questions", "duplicate_node_key", "invalid_order", "non_root_upload_slot", "orphan_parent"].includes(item.code))
    ? "blocked"
    : warnings.some((item) => ["marks_missing"].includes(item.code))
      ? "warning"
      : "ready";
  checks.source = warnings.some((item) => item.code.startsWith("source") || item.code.startsWith("visual") || item.code.startsWith("question_source_regions")) ? "warning" : "ready";
  checks.markscheme = warnings.some((item) => item.code.includes("markscheme")) ? "warning" : "ready";
  checks.delivery = version?.status === "published" ? "ready" : "warning";
  checks.marking = attemptedTotal.max > 0 ? "ready" : "warning";

  const uniqueBlockers = uniqueItems(blockers);
  const uniqueWarnings = uniqueItems(warnings).filter((warning) => !uniqueBlockers.some((blocker) => blocker.code === warning.code && blocker.message === warning.message));
  const score = Math.max(0, Math.min(100, 100 - uniqueBlockers.length * 25 - uniqueWarnings.length * 8));
  const status: PaperHealthStatus = uniqueBlockers.length ? "blocked" : uniqueWarnings.length ? "warning" : "ready";

  return { status, score, blockers: uniqueBlockers, warnings: uniqueWarnings, checks };
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function uniqueItems(items: PaperHealthItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function markingTreeToNormalized(nodes: ReturnType<typeof getSelectableMarkingGroups>): NormalizedQuestionHierarchyNode[] {
  return nodes.map((node) => ({
    node_id: node.id,
    node_key: node.node_key,
    normalized_key: node.node_key,
    display_label: node.display_label ?? node.node_key,
    parent_node_key: node.parent_node_id,
    root_question_key: node.root_question_id_resolved,
    depth: node.depth_resolved,
    ordinal_path: node.ordinal_path_resolved,
    ordinal: node.ordinal,
    node_type: node.node_type,
    title: node.title,
    prompt_html: node.prompt_html,
    prompt_latex: node.prompt_latex,
    marks: node.marks,
    marks_available: node.marks,
    mark_mode: node.children.length ? "computed" : "manual",
    response_mode: node.response_mode,
    interaction_json: typeof node.interaction_json === "object" && node.interaction_json !== null ? node.interaction_json : null,
    markscheme_html: node.markscheme_html,
    assets: node.assets ?? [],
    source_page_start: node.source_page_start,
    source_page_end: node.source_page_end,
    source_region_json: typeof node.source_region_json === "object" && node.source_region_json !== null ? node.source_region_json : null,
    has_visual_assets: Boolean(node.has_visual_assets),
    visual_asset_refs: node.visual_asset_refs ?? null,
    children: markingTreeToNormalized(node.children),
  }));
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasNumericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

type RegionForOverlap = Pick<QuestionSourceRegion, "id" | "source_document_id" | "source_page_id" | "region_type" | "bbox_json">;

function findOverlappingSourceRegions(regions: RegionForOverlap[]) {
  const overlaps: Array<[string, string]> = [];
  const checkedTypes = new Set(["question", "subquestion", "answer_area"]);
  for (let index = 0; index < regions.length; index += 1) {
    const first = regions[index]!;
    if (!checkedTypes.has(first.region_type)) continue;
    const firstBbox = parseRegionBbox(first.bbox_json);
    for (let next = index + 1; next < regions.length; next += 1) {
      const second = regions[next]!;
      if (!checkedTypes.has(second.region_type)) continue;
      if (first.source_document_id !== second.source_document_id) continue;
      if ((first.source_page_id ?? "") !== (second.source_page_id ?? "")) continue;
      const secondBbox = parseRegionBbox(second.bbox_json);
      if (firstBbox.page !== secondBbox.page) continue;
      if (bboxOverlap(firstBbox, secondBbox) > 0.01) overlaps.push([first.id, second.id]);
    }
  }
  return overlaps;
}

function parseRegionBbox(value: unknown) {
  const source = safeRecord(value);
  const x = clampUnit(Number(source.x ?? 0));
  const y = clampUnit(Number(source.y ?? 0));
  const width = Math.max(0, Math.min(1 - x, Number(source.width ?? 0)));
  const height = Math.max(0, Math.min(1 - y, Number(source.height ?? 0)));
  return {
    page: Math.max(1, Math.floor(Number(source.page ?? 1) || 1)),
    x,
    y,
    width,
    height,
  };
}

function bboxOverlap(
  first: ReturnType<typeof parseRegionBbox>,
  second: ReturnType<typeof parseRegionBbox>,
) {
  const xOverlap = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const yOverlap = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return xOverlap * yOverlap;
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
