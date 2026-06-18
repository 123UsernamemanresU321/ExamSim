import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildRubricItemsForNode,
  buildRubricReadinessWarnings,
  summarizeRubricTemplateTotals,
} from "@/lib/examsim/rubric-readiness";

const baseTemplate = {
  owner_profile_id: "owner-1",
  subject: "Mathematics",
  description: null,
  tags: [],
  created_at: "2026-06-18T00:00:00.000Z",
  updated_at: "2026-06-18T00:00:00.000Z",
};

const baseItem = {
  description: null,
  feedback_text: null,
  created_at: "2026-06-18T00:00:00.000Z",
};

const baseNode = {
  assessment_version_id: "version-1",
  parent_node_id: null,
  ordinal: 1,
  node_type: "question" as const,
  title: null,
  prompt_html: null,
  prompt_latex: null,
  response_mode: "typed_text" as const,
  interaction_json: null,
  markscheme_html: null,
  assets: null,
  source_page_start: null,
  source_page_end: null,
  created_at: "2026-06-18T00:00:00.000Z",
};

describe("rubric readiness", () => {
  it("matches rubric templates to question nodes and warns when selected point banks exceed question marks", () => {
    const templates = [
      { ...baseTemplate, id: "proof", name: "Q1 proof rubric" },
      { ...baseTemplate, id: "statistics", name: "Statistics table rubric" },
    ];
    const items = [
      { ...baseItem, id: "m1", rubric_template_id: "proof", ordinal: 1, label: "Method", max_marks: 2, mark_code: "M1" },
      { ...baseItem, id: "a1", rubric_template_id: "proof", ordinal: 2, label: "Answer", max_marks: 2, mark_code: "A1" },
      { ...baseItem, id: "b1", rubric_template_id: "statistics", ordinal: 1, label: "Table complete", max_marks: 1, mark_code: "B1" },
    ];
    const questionNodes = [
      { ...baseNode, id: "q1", node_key: "Q1", display_label: "Q1", marks: 3, title: "Proof" },
      { ...baseNode, id: "q2", node_key: "Q2", display_label: "Q2", marks: 5, title: "Statistics table" },
    ];

    expect(buildRubricItemsForNode(questionNodes[0], templates, items).map((item) => item.id)).toEqual(["m1", "a1"]);
    expect(summarizeRubricTemplateTotals(templates, items)).toEqual([
      { templateId: "proof", totalMarks: 4, itemCount: 2 },
      { templateId: "statistics", totalMarks: 1, itemCount: 1 },
    ]);

    expect(buildRubricReadinessWarnings(questionNodes, templates, items)).toEqual([
      {
        code: "rubric_total_exceeds_question_marks",
        questionNodeId: "q1",
        questionLabel: "Q1",
        templateId: "proof",
        templateName: "Q1 proof rubric",
        rubricTotal: 4,
        questionMarks: 3,
        message: "Q1 uses Q1 proof rubric with 4 rubric mark(s), but the question maximum is 3.",
      },
    ]);
  });

  it("surfaces rubric total warnings on the owner rubric setup page", () => {
    const source = readFileSync("app/owner/assessments/[id]/rubrics/page.tsx", "utf8");
    expect(source).toContain("buildRubricReadinessWarnings");
    expect(source).toContain("Rubric readiness");
    expect(source).toContain("Total point value");
    expect(source).toContain("question maximum");
  });
});
