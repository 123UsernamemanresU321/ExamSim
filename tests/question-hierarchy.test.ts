import { describe, expect, it } from "vitest";
import {
  buildNormalizedQuestionTree,
  calculateAttemptTotal,
  calculateNodeMarks,
  buildParentKey,
  buildRootQuestionKey,
  classifyDocumentSection,
  compareOrdinalPath,
  letterToNumber,
  matchMarkschemeNodesToQuestions,
  normalizeNodeKey,
  parseNodeKey,
  romanToNumber,
  type RawQuestionHierarchyNode,
} from "@/lib/question-hierarchy";

describe("question hierarchy normalization", () => {
  it("normalizes common question key variants", () => {
    expect(normalizeNodeKey("Q1")).toBe("Q1");
    expect(normalizeNodeKey("1")).toBe("Q1");
    expect(normalizeNodeKey("Question 1")).toBe("Q1");
    expect(normalizeNodeKey("1(a)")).toBe("1(a)");
    expect(normalizeNodeKey("1a")).toBe("1(a)");
    expect(normalizeNodeKey("1.a")).toBe("1(a)");
    expect(normalizeNodeKey("1(b)(ii)")).toBe("1(b)(ii)");
    expect(normalizeNodeKey("7(a)(ii)")).toBe("7(a)(ii)");
  });

  it("parses ordinal path, parent key, and root key", () => {
    const parsed = parseNodeKey("3(a)(ii)");
    expect(parsed).toMatchObject({
      normalized_key: "3(a)(ii)",
      display_label: "3(a)(ii)",
      parent_node_key: "3(a)",
      root_question_key: "Q3",
      depth: 2,
      ordinal_path: [3, 1, 2],
      node_type: "part",
    });
    expect(buildParentKey(parsed!)).toBe("3(a)");
    expect(buildRootQuestionKey(parsed!)).toBe("Q3");
    expect(romanToNumber("iv")).toBe(4);
    expect(letterToNumber("c")).toBe(3);
  });

  it("compares ordinal paths numerically and preorders descendants", () => {
    expect(compareOrdinalPath([1], [1, 1])).toBeLessThan(0);
    expect(compareOrdinalPath([1, 1], [1, 1, 1])).toBeLessThan(0);
    expect(compareOrdinalPath([1, 1, 1], [1, 1, 2])).toBeLessThan(0);
    expect(compareOrdinalPath([1, 2], [2])).toBeLessThan(0);
    expect(compareOrdinalPath([9], [10])).toBeLessThan(0);
    expect(compareOrdinalPath([3, 1, 2], [3, 2])).toBeLessThan(0);
  });

  it("repairs the exact bad flat AI output into a nested preorder tree", () => {
    const badKeys = [
      "1(a)",
      "2(a)",
      "3(a)",
      "4(a)",
      "5(a)",
      "6(a)",
      "Q1",
      "1(b)(i)",
      "1(b)",
      "1(b)(ii)",
      "Q2",
      "3(b)",
      "5(b)",
      "6(b)",
      "2(b)",
      "4(b)",
      "3(c)",
      "5(c)",
      "Q3",
      "6(c)",
      "2(c)",
      "4(c)",
      "1(c)",
      "2(d)",
      "Q4",
      "4(d)",
      "5(d)",
      "Q5",
      "Q6",
    ];

    const result = buildNormalizedQuestionTree(badKeys.map((key) => rawNode(key)));

    expect(result.flat.map((node) => node.node_key)).toEqual([
      "Q1",
      "1(a)",
      "1(b)",
      "1(b)(i)",
      "1(b)(ii)",
      "1(c)",
      "Q2",
      "2(a)",
      "2(b)",
      "2(c)",
      "2(d)",
      "Q3",
      "3(a)",
      "3(b)",
      "3(c)",
      "Q4",
      "4(a)",
      "4(b)",
      "4(c)",
      "4(d)",
      "Q5",
      "5(a)",
      "5(b)",
      "5(c)",
      "5(d)",
      "Q6",
      "6(a)",
      "6(b)",
      "6(c)",
    ]);
    expect(result.tree.map((node) => node.node_key)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
    expect(result.tree[0]?.children.map((node) => node.parent_node_key)).toEqual(["Q1", "Q1", "Q1"]);
    expect(result.tree[0]?.children[1]?.children.map((node) => node.parent_node_key)).toEqual(["1(b)", "1(b)"]);
  });

  it("creates missing roots and intermediate parents", () => {
    const result = buildNormalizedQuestionTree([
      rawNode("3(a)(i)", { marks: 2 }),
      rawNode("3(a)(ii)", { marks: 3 }),
    ]);

    expect(result.flat.map((node) => node.node_key)).toEqual(["Q3", "3(a)", "3(a)(i)", "3(a)(ii)"]);
    expect(result.flat.find((node) => node.node_key === "Q3")?.synthetic).toBe(true);
    expect(result.flat.find((node) => node.node_key === "3(a)")?.synthetic).toBe(true);
    expect(result.flat.find((node) => node.node_key === "3(a)(i)")?.mark_mode).toBe("manual");
  });

  it("merges duplicate root keys and prefers richer prompt content", () => {
    const result = buildNormalizedQuestionTree([
      rawNode("1", { prompt_html: "Short", marks: 5 }),
      rawNode("Q1", { prompt_html: "A richer question stem with a diagram below.", has_visual_assets: true }),
      rawNode("1(a)", { response_mode: "typed_or_upload", marks: 2 }),
    ]);

    const q1 = result.tree[0];
    expect(q1?.node_key).toBe("Q1");
    expect(q1?.prompt_html).toBe("A richer question stem with a diagram below.");
    expect(q1?.has_visual_assets).toBe(true);
    expect(q1?.children[0]?.response_mode).toBe("none");
  });

  it("marks parent nodes as computed and child leaves as manual without upload slots", () => {
    const result = buildNormalizedQuestionTree([
      rawNode("Q3", { marks: 5, response_mode: "upload_pdf" }),
      rawNode("3(a)", { marks: 2, response_mode: "upload_pdf" }),
      rawNode("3(b)", { marks: 3, response_mode: "typed_or_upload" }),
    ]);

    expect(result.tree[0]).toMatchObject({ mark_mode: "computed", response_mode: "upload_pdf", marks_available: 5 });
    expect(result.tree[0]?.children.map((node) => [node.node_key, node.mark_mode, node.response_mode])).toEqual([
      ["3(a)", "manual", "none"],
      ["3(b)", "manual", "none"],
    ]);
  });

  it("calculates recursive marks without double-counting parent totals", () => {
    const result = buildNormalizedQuestionTree([
      rawNode("Q3", { marks: 99 }),
      rawNode("3(a)", { marks: 5 }),
      rawNode("3(a)(i)", { marks: 2 }),
      rawNode("3(a)(ii)", { marks: 3 }),
      rawNode("3(b)", { marks: 4 }),
      rawNode("Q4", { marks: 6 }),
    ]);
    const awarded = (node: { node_key?: string }) => {
      if (node.node_key === "3(a)(i)") return 2;
      if (node.node_key === "3(a)(ii)") return 1;
      if (node.node_key === "3(b)") return 4;
      if (node.node_key === "Q4") return 5;
      return null;
    };

    expect(calculateNodeMarks(result.tree[0]!, awarded)).toEqual({ awarded: 7, max: 9 });
    expect(calculateAttemptTotal(result.tree, awarded)).toEqual({ awarded: 12, max: 15 });
  });

  it("keeps markscheme covers out of question matching and matches question-specific sections by key", () => {
    expect(classifyDocumentSection("Markscheme\nGeneral marking instructions: award marks according to...", "markscheme")).toBe(
      "markscheme_instructions",
    );
    expect(classifyDocumentSection("Question 3\n(a) Award M1 for method, A1 for answer.", "markscheme")).toBe(
      "markscheme_question_page",
    );

    const result = buildNormalizedQuestionTree([rawNode("Q3"), rawNode("3(a)")]);
    const matches = matchMarkschemeNodesToQuestions(result.flat, [
      { node_key: "3(a)", ordinal_path: [3, 1] },
      { node_key: "Q1", ordinal_path: [1] },
    ]);

    expect(matches[0]?.questionNode?.node_key).toBe("3(a)");
    expect(matches[1]?.questionNode).toBeNull();
  });
});

function rawNode(nodeKey: string, overrides: Partial<RawQuestionHierarchyNode> = {}): RawQuestionHierarchyNode {
  return {
    node_key: nodeKey,
    prompt_html: `Prompt for ${nodeKey}`,
    marks: 1,
    response_mode: "typed_or_upload",
    ...overrides,
  };
}
