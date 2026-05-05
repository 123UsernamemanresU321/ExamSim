import { z } from "zod";
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
  kind: z.enum(["choice", "short_text", "extended_text"]),
  max_choices: z.number().int().positive().optional(),
  shuffle: z.boolean().optional(),
  choices: z.array(choiceSchema).optional(),
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

export function flattenQuestionNodes(nodes: QuestionNode[]): QuestionNode[] {
  return nodes.flatMap((node) => [node, ...flattenQuestionNodes(node.children ?? [])]);
}

export function estimatePackageMarks(nodes: QuestionNode[]): number {
  return flattenQuestionNodes(nodes).reduce((sum, node) => sum + (node.marks ?? 0), 0);
}
