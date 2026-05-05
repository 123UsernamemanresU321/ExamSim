import { describe, expect, it } from "vitest";
import { normalizedPackageSchema } from "@/lib/assessment-package";

describe("normalizedPackageSchema", () => {
  it("accepts a QTI-aligned JSON package with nested question nodes", () => {
    const parsed = normalizedPackageSchema.parse({
      schema_version: "2026-05-05",
      assessment: {
        id: "asm_seed",
        title: "Olympiad Mock",
        paper_code: "MATH-MOCK-01",
        assessment_kind: "exam",
        source_kind: "json",
        authoring_origin: "imported",
        display_timezone: "Africa/Johannesburg",
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
        normalized_by: "owner-import:v1",
        parse_confidence: 1,
        requires_owner_review: false,
      },
      questions: [
        {
          node_id: "q1",
          node_key: "1",
          ordinal: 1,
          node_type: "question",
          marks: 10,
          response_mode: "typed_or_upload",
          prompt: {
            latex: "Solve $x^2=4$.",
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
    });

    expect(parsed.questions[0]?.children?.[0]?.node_key).toBe("1(a)");
  });

  it("rejects unknown assessment kinds", () => {
    expect(() =>
      normalizedPackageSchema.parse({
        schema_version: "2026-05-05",
        assessment: {
          id: "asm_bad",
          title: "Bad",
          assessment_kind: "homework",
          source_kind: "json",
          authoring_origin: "imported",
          display_timezone: "Africa/Johannesburg",
        },
        delivery: {
          delivery_mode: "browser",
          solutions_requested: false,
          response_policy: {
            typed_allowed: true,
            mixed_mode_allowed: false,
            per_question_pdf_upload: false,
            blank_submission_required_for_unattempted: false,
          },
        },
        source: {
          requires_owner_review: false,
        },
        questions: [],
      }),
    ).toThrow();
  });
});
