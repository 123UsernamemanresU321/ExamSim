import { describe, expect, it } from "vitest";
import { parseQuestionTreeInput, serializeEditableQuestionNodes } from "@/lib/question-tree-editor";
import type { QuestionNodeRow } from "@/types/database";

describe("question tree editor input", () => {
  it("accepts a flat editable node array", () => {
    const parsed = parseQuestionTreeInput(JSON.stringify([{ node_key: "1", ordinal: 1, node_type: "question" }]));
    expect(parsed.nodes[0]).toMatchObject({ node_key: "1", node_type: "question", response_mode: "typed_or_upload" });
    expect(parsed.normalizedPackage).toBeNull();
  });

  it("accepts a full normalized package proposal from the AI parse assistant", () => {
    const parsed = parseQuestionTreeInput(
      JSON.stringify({
        schema_version: "2026-05-07",
        questions: [
          {
            node_id: "q1",
            node_key: "1",
            ordinal: 1,
            node_type: "question",
            response_mode: "typed_text",
            prompt: { latex: "Prove the result." },
            children: [{ node_id: "q1a", node_key: "1(a)", ordinal: 1, node_type: "subquestion", response_mode: "typed_or_upload" }],
          },
        ],
      }),
    );
    expect(parsed.normalizedPackage?.schema_version).toBe("2026-05-07");
    expect(parsed.nodes.map((node) => node.node_key)).toEqual(["1", "1(a)"]);
    expect(parsed.nodes[1]?.parent_node_key).toBe("1");
  });

  it("accepts a DeepSeek suggestion wrapper", () => {
    const parsed = parseQuestionTreeInput(
      JSON.stringify({
        normalized_package: {
          questions: [{ node_id: "q1", node_key: "1", ordinal: 1, node_type: "question", response_mode: "typed_text" }],
        },
      }),
    );
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.normalizedPackage?.questions).toBeDefined();
  });

  it("accepts a saved suggestion row wrapper", () => {
    const parsed = parseQuestionTreeInput(
      JSON.stringify({
        suggestion: {
          normalized_package_json: {
            questions: [{ node_id: "q1", node_key: "1", ordinal: 1, node_type: "Question", response_mode: "typed" }],
          },
        },
      }),
    );
    expect(parsed.nodes[0]).toMatchObject({ node_key: "1", node_type: "question", response_mode: "typed_text" });
  });

  it("preserves parent keys and source page references when serializing existing rows", () => {
    const serialized = serializeEditableQuestionNodes([
      row({ id: "parent", node_key: "1", parent_node_id: null, source_page_start: 2, source_page_end: 3 }),
      row({ id: "child", node_key: "1(a)", parent_node_id: "parent", source_page_start: 3, source_page_end: 3 }),
    ]);
    const parsed = parseQuestionTreeInput(serialized);
    expect(parsed.nodes[1]).toMatchObject({ parent_node_key: "1", source_page_start: 3, source_page_end: 3 });
  });

  it("normalizes common AI field variants in flat node arrays", () => {
    const parsed = parseQuestionTreeInput(
      JSON.stringify([
        {
          node_key: "2",
          ordinal: "2",
          node_type: "SubQuestion",
          marks: "6",
          response_mode: "pdf",
          prompt: { latex: "Solve x^2=4." },
          interaction: { kind: "extended_text" },
          source_page_start: "4",
        },
      ]),
    );
    expect(parsed.nodes[0]).toMatchObject({
      ordinal: 2,
      node_type: "subquestion",
      marks: 6,
      response_mode: "upload_pdf",
      prompt_latex: "Solve x^2=4.",
      source_page_start: 4,
    });
  });
});

function row(overrides: Partial<QuestionNodeRow>): QuestionNodeRow {
  return {
    id: "id",
    assessment_version_id: "version",
    parent_node_id: null,
    node_key: "1",
    ordinal: 1,
    node_type: "question",
    title: null,
    prompt_html: null,
    prompt_latex: null,
    marks: null,
    response_mode: "typed_or_upload",
    interaction_json: null,
    source_page_start: null,
    source_page_end: null,
    created_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
