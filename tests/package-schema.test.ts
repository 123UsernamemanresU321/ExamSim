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

  it("accepts numerical and multi-select multiple-choice response modes", () => {
    const base = {
      schema_version: "2026-05-13",
      assessment: {
        id: "asm_response_modes",
        title: "Response Mode Check",
        assessment_kind: "quiz",
        source_kind: "json",
        authoring_origin: "imported",
        display_timezone: "Africa/Johannesburg",
      },
      delivery: {
        delivery_mode: "browser",
        solutions_requested: false,
        response_policy: {
          typed_allowed: true,
          mixed_mode_allowed: true,
          per_question_pdf_upload: true,
          blank_submission_required_for_unattempted: false,
        },
      },
      source: { requires_owner_review: false },
    };

    const parsed = normalizedPackageSchema.parse({
      ...base,
      questions: [
        {
          node_id: "num-1",
          node_key: "1",
          ordinal: 1,
          node_type: "question",
          marks: 2,
          response_mode: "numerical",
          prompt: { html: "<p>Enter the value of x.</p>" },
          interaction: { kind: "numerical", min_value: 0, max_value: 10, step: 0.1, unit: "cm" },
        },
        {
          node_id: "mc-1",
          node_key: "2",
          ordinal: 2,
          node_type: "question",
          marks: 3,
          response_mode: "multiple_choice",
          prompt: { html: "<p>Select all primes.</p>" },
          interaction: {
            kind: "choice",
            max_choices: 3,
            choices: [
              { choice_id: "a", content_html: "<p>2</p>" },
              { choice_id: "b", content_html: "<p>3</p>" },
              { choice_id: "c", content_html: "<p>4</p>" },
            ],
          },
        },
      ],
    });

    expect(parsed.questions[0]?.response_mode).toBe("numerical");
    expect(parsed.questions[0]?.interaction?.kind).toBe("numerical");
    expect(parsed.questions[1]?.interaction?.max_choices).toBe(3);
  });
});
