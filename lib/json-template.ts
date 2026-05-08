import { DEFAULT_TIMEZONE } from "@/lib/constants";
import type { NormalizedAssessmentPackage } from "@/lib/assessment-package";

export const normalizedJsonTemplate: NormalizedAssessmentPackage = {
  schema_version: "2026-05-07",
  assessment: {
    id: "assess_unique_id",
    title: "International Mathematical Olympiad 2026",
    paper_code: "IMO-2026-P1",
    assessment_kind: "exam",
    source_kind: "json",
    authoring_origin: "owner_uploaded",
    display_timezone: DEFAULT_TIMEZONE,
  },
  delivery: {
    delivery_mode: "browser",
    duration_seconds: 7200,
    solutions_requested: true,
    upload_only_grace_seconds: 1800,
    response_policy: {
      typed_allowed: true,
      mixed_mode_allowed: true,
      per_question_pdf_upload: true,
      blank_submission_required_for_unattempted: false,
    },
  },
  source: {
    normalized_by: "manual_upload",
    parse_confidence: 1,
    requires_owner_review: true,
  },
  questions: [
    {
      node_id: "q1",
      node_key: "1",
      ordinal: 1,
      node_type: "question",
      title: "Problem 1",
      marks: 7,
      response_mode: "typed_or_upload",
      prompt: {
        html: "<p>Prove that for any positive integer $n$, the expression $2^{2n+1} + 1$ is divisible by $3$.</p>",
        latex: "Prove that for any positive integer $n$, the expression $2^{2n+1} + 1$ is divisible by $3$.",
      },
      children: [],
    },
    {
      node_id: "q2",
      node_key: "2",
      ordinal: 2,
      node_type: "section",
      title: "Geometry Section",
      response_mode: "none",
      children: [
        {
          node_id: "q2a",
          node_key: "2(a)",
          ordinal: 1,
          node_type: "subquestion",
          title: "Part A",
          marks: 3,
          response_mode: "typed_text",
          prompt: {
            html: "<p>Define a cyclic quadrilateral.</p>",
            latex: "Define a cyclic quadrilateral.",
          },
          children: [],
        },
      ],
    },
  ],
};

export function normalizedJsonTemplateText() {
  return JSON.stringify(normalizedJsonTemplate, null, 2);
}
