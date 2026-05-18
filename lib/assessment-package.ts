import { z } from "zod";
import type { Json, QuestionNodeRow } from "@/types/database";
import { buildMarkingTree, type MarkingTreeNode } from "@/lib/marking-tree";
import {
  ASSESSMENT_KINDS,
  AUTHORING_ORIGINS,
  DELIVERY_MODES,
  DEFAULT_TIMEZONE,
  QUESTION_NODE_TYPES,
  RESPONSE_MODES,
  SOURCE_KINDS,
} from "@/lib/constants";

const choiceSchema = z.object({
  choice_id: z.string().min(1),
  content_html: z.string().min(1),
});

const interactionSchema = z.object({
  kind: z.enum(["choice", "short_text", "extended_text", "numerical"]),
  max_choices: z.number().int().positive().optional(),
  shuffle: z.boolean().optional(),
  choices: z.array(choiceSchema).optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  step: z.number().positive().optional(),
  tolerance: z.number().nonnegative().optional(),
  unit: z.string().optional(),
});

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

const questionNodeBaseSchema = z.object({
  node_id: z.string().min(1),
  node_key: z.string().min(1),
  normalized_key: z.string().optional(),
  display_label: z.string().optional(),
  parent_node_key: z.string().nullable().optional(),
  root_question_key: z.string().optional(),
  depth: z.number().int().min(0).optional(),
  ordinal_path: z.array(z.number().int().min(0)).optional(),
  ordinal: z.number().int().min(0),
  node_type: z.enum(QUESTION_NODE_TYPES),
  title: z.string().optional(),
  marks: z.number().nonnegative().optional(),
  response_mode: z.enum(RESPONSE_MODES),
  prompt: z
    .object({
      html: z.string().optional(),
      latex: z.string().optional(),
    })
    .optional(),
  markscheme_html: z.string().optional(),
  markscheme_pdf_path: z.string().optional(),
  assets: z.array(z.string()).optional(),
  source_page_start: z.number().int().positive().optional(),
  source_page_end: z.number().int().positive().optional(),
  source_region_json: jsonSchema.optional(),
  has_visual_assets: z.boolean().optional(),
  visual_asset_refs: z.array(z.union([z.string(), z.record(z.string(), jsonSchema)])).optional(),
  interaction: interactionSchema.optional(),
});

export type QuestionNode = z.infer<typeof questionNodeBaseSchema> & {
  children?: QuestionNode[];
};

export const questionNodeSchema: z.ZodType<QuestionNode> = questionNodeBaseSchema.extend({
  children: z.lazy(() => questionNodeSchema.array()).optional(),
});

export const normalizedPackageSchema = z.object({
  schema_version: z.string().min(1),
  document_sections: z
    .array(
      z.object({
        type: z.string(),
        page_start: z.number().int().positive().nullable().optional(),
        page_end: z.number().int().positive().nullable().optional(),
        reason: z.string().optional(),
      }),
    )
    .optional(),
  assessment: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    paper_code: z.string().optional(),
    assessment_kind: z.enum(ASSESSMENT_KINDS),
    source_kind: z.enum(SOURCE_KINDS),
    authoring_origin: z.enum(AUTHORING_ORIGINS),
    external_schedule_ref: z.string().optional(),
    display_timezone: z.string().default(DEFAULT_TIMEZONE),
    markscheme_html: z.string().optional(),
    markscheme_pdf_path: z.string().optional(),
  }),
  delivery: z.object({
    delivery_mode: z.enum(DELIVERY_MODES),
    start_at_utc: z.string().datetime().optional(),
    duration_seconds: z.number().int().positive().optional(),
    solutions_requested: z.boolean(),
    upload_only_grace_seconds: z.number().int().nonnegative().optional(),
    response_policy: z.object({
      typed_allowed: z.boolean(),
      mixed_mode_allowed: z.boolean(),
      per_question_pdf_upload: z.boolean(),
      blank_submission_required_for_unattempted: z.boolean(),
    }),
  }),
  source: z.object({
    original_object_path: z.string().optional(),
    normalized_by: z.string().optional(),
    parse_confidence: z.number().min(0).max(1).optional(),
    requires_owner_review: z.boolean(),
  }),
  questions: z.array(questionNodeSchema),
  markscheme_nodes: z.array(jsonSchema).optional(),
  unmatched_markscheme_sections: z.array(jsonSchema).optional(),
});

export type NormalizedAssessmentPackage = z.infer<typeof normalizedPackageSchema>;

export function reconstructQuestionTree(rows: QuestionNodeRow[]): QuestionNode[] {
  return buildMarkingTree(rows).map(markingNodeToPackageNode);
}

function markingNodeToPackageNode(row: MarkingTreeNode): QuestionNode {
  return {
    node_id: row.id,
    node_key: row.node_key,
    normalized_key: row.display_label ?? row.node_key,
    display_label: row.display_label ?? undefined,
    root_question_key: Array.isArray(row.ordinal_path) && row.ordinal_path.length ? `Q${row.ordinal_path[0]}` : undefined,
    depth: row.depth ?? undefined,
    ordinal_path: row.ordinal_path ?? undefined,
    ordinal: row.ordinal,
    node_type: row.node_type as "section" | "question" | "subquestion" | "part",
    title: row.title || undefined,
    marks: row.marks || undefined,
    response_mode: row.response_mode as "none" | "typed_text" | "upload_pdf" | "typed_or_upload" | "multiple_choice" | "numerical",
    prompt: (row.prompt_html || row.prompt_latex) ? {
      html: row.prompt_html || undefined,
      latex: row.prompt_latex || undefined,
    } : undefined,
    markscheme_html: row.markscheme_html || undefined,
    markscheme_pdf_path: row.markscheme_pdf_path || undefined,
    assets: row.assets ?? undefined,
    source_page_start: row.source_page_start ?? undefined,
    source_page_end: row.source_page_end ?? undefined,
    source_region_json: row.source_region_json ?? undefined,
    has_visual_assets: row.has_visual_assets ?? undefined,
    visual_asset_refs: row.visual_asset_refs ?? undefined,
    interaction: row.interaction_json as { kind: "choice" | "short_text" | "extended_text" | "numerical" } | undefined,
    children: row.children.map(markingNodeToPackageNode),
  };
}

export function flattenQuestionNodes(nodes: QuestionNode[]): QuestionNode[] {
  return nodes.flatMap((node) => [node, ...flattenQuestionNodes(node.children ?? [])]);
}

export function estimatePackageMarks(nodes: QuestionNode[]): number {
  return flattenQuestionNodes(nodes)
    .filter((node) => !node.children?.length)
    .reduce((sum, node) => sum + (node.marks ?? 0), 0);
}
