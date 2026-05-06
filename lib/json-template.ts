import { DEFAULT_TIMEZONE } from "@/lib/constants";
import type { NormalizedAssessmentPackage } from "@/lib/assessment-package";

export const normalizedJsonTemplate: NormalizedAssessmentPackage = {
  schema_version: "2026-05-06",
  assessment: {
    id: "replace-with-assessment-id",
    title: "Untitled Exam",
    paper_code: "PAPER-CODE",
    assessment_kind: "exam",
    source_kind: "json",
    authoring_origin: "imported",
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
    normalized_by: "owner-template",
    parse_confidence: 1,
    requires_owner_review: true,
  },
  questions: [
    {
      node_id: "q1",
      node_key: "1",
      ordinal: 1,
      node_type: "question",
      title: "Question 1",
      marks: 10,
      response_mode: "typed_or_upload",
      prompt: {
        latex: "Solve $x^2 = 4$.",
      },
      children: [
        {
          node_id: "q1a",
          node_key: "1(a)",
          ordinal: 1,
          node_type: "subquestion",
          marks: 4,
          response_mode: "typed_text",
          prompt: {
            html: "<p>Find the positive root.</p>",
          },
        },
      ],
    },
  ],
};

export function normalizedJsonTemplateText() {
  return JSON.stringify(normalizedJsonTemplate, null, 2);
}
