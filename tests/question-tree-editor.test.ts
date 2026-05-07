import { describe, expect, it } from "vitest";
import { parseQuestionTreeInput } from "@/lib/question-tree-editor";

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
});
