import { z } from "zod";
import type { QuestionNodeRow } from "@/types/database";
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

const questionNodeBaseSchema = z.object({
  node_id: z.string().min(1),
  node_key: z.string().min(1),
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
});

export type NormalizedAssessmentPackage = z.infer<typeof normalizedPackageSchema>;

export function reconstructQuestionTree(rows: QuestionNodeRow[]): QuestionNode[] {
  const nodeMap = new Map<string, QuestionNode>();
  const roots: QuestionNode[] = [];

  // Sort by ordinal first to ensure children are in order
  const sortedRows = [...rows].sort((a, b) => a.ordinal - b.ordinal);

  for (const row of sortedRows) {
    const node: QuestionNode = {
      node_id: row.id,
      node_key: row.node_key,
      ordinal: row.ordinal,
      node_type: row.node_type as "section" | "question" | "subquestion" | "part",
      title: row.title || undefined,
      marks: row.marks || undefined,
      response_mode: row.response_mode as "none" | "typed_text" | "upload_pdf" | "typed_or_upload" | "multiple_choice" | "numerical",
      prompt: (row.prompt_html || row.prompt_latex) ? {
        html: row.prompt_html || undefined,
        latex: row.prompt_latex || undefined,
      } : undefined,
      markscheme_html: (row as { markscheme_html?: string | null }).markscheme_html || undefined,
      markscheme_pdf_path: (row as { markscheme_pdf_path?: string | null }).markscheme_pdf_path || undefined,
      assets: row.assets ?? undefined,
      interaction: row.interaction_json as { kind: "choice" | "short_text" | "extended_text" | "numerical" } | undefined,
      children: [],
    };
    nodeMap.set(row.id, node);
  }

  for (const row of sortedRows) {
    const node = nodeMap.get(row.id)!;
    if (row.parent_node_id && nodeMap.has(row.parent_node_id)) {
      const parent = nodeMap.get(row.parent_node_id)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function flattenQuestionNodes(nodes: QuestionNode[]): QuestionNode[] {
  return nodes.flatMap((node) => [node, ...flattenQuestionNodes(node.children ?? [])]);
}

export function estimatePackageMarks(nodes: QuestionNode[]): number {
  return flattenQuestionNodes(nodes).reduce((sum, node) => sum + (node.marks ?? 0), 0);
}
