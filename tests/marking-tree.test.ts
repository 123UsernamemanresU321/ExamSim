import { describe, expect, it } from "vitest";
import {
  buildMarkingTree,
  calculateAttemptTotal,
  computeMarkingTotals,
  flattenMarkingTree,
  getMarkableLeafNodes,
  getSelectableMarkingGroups,
  isMarkableMarkingNode,
} from "@/lib/marking-tree";
import { classifyDocumentSection, ordinalPathForQuestionKey } from "@/lib/question-hierarchy";
import type { Mark, QuestionNodeRow } from "@/types/database";

describe("marking tree helpers", () => {
  it("reconstructs nested question order from parent ids instead of flat ordinals", () => {
    const rows = [
      row({ id: "q1a", node_key: "1(a)", parent_node_id: "q1", ordinal: 1, node_type: "subquestion" }),
      row({ id: "q1ai", node_key: "1(a)(i)", parent_node_id: "q1a", ordinal: 1, node_type: "part" }),
      row({ id: "q2", node_key: "Q2", ordinal: 2, node_type: "question" }),
      row({ id: "q1", node_key: "Q1", ordinal: 1, node_type: "question", response_mode: "none" }),
      row({ id: "q7aii", node_key: "7(a)(ii)", parent_node_id: "q7a", ordinal: 2, node_type: "part" }),
      row({ id: "q7a", node_key: "7(a)", parent_node_id: "q7", ordinal: 1, node_type: "subquestion", response_mode: "none" }),
      row({ id: "q7", node_key: "Q7", ordinal: 7, node_type: "question", response_mode: "none" }),
    ];

    const groups = getSelectableMarkingGroups(buildMarkingTree(rows));

    expect(groups.map((node) => node.node_key)).toEqual(["Q1", "Q2", "Q7"]);
    expect(groups[0]?.children.map((node) => node.node_key)).toEqual(["1(a)"]);
    expect(groups[0]?.children[0]?.children.map((node) => node.node_key)).toEqual(["1(a)(i)"]);
    expect(groups[2]?.children[0]?.children.map((node) => node.node_key)).toEqual(["7(a)(ii)"]);
  });

  it("infers missing parent links from nested node keys for older flattened data", () => {
    const tree = buildMarkingTree([
      row({ id: "q3", node_key: "Q3", ordinal: 3, response_mode: "none" }),
      row({ id: "q3a", node_key: "3(a)", ordinal: 1, node_type: "subquestion", response_mode: "none" }),
      row({ id: "q3ai", node_key: "3(a)(i)", ordinal: 1, node_type: "part" }),
      row({ id: "q3aii", node_key: "3(a)(ii)", ordinal: 2, node_type: "part" }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.node_key).toBe("Q3");
    expect(tree[0]?.children[0]?.node_key).toBe("3(a)");
    expect(tree[0]?.children[0]?.children.map((node) => node.node_key)).toEqual(["3(a)(i)", "3(a)(ii)"]);
    expect(tree[0]?.children[0]?.inferred_parent_id).toBe("q3");
  });

  it("creates missing display parents and sorts by numeric ordinal path", () => {
    const tree = buildMarkingTree([
      row({ id: "q1", node_key: "Q1", ordinal: 1, response_mode: "none" }),
      row({ id: "q1a", node_key: "Q1(a)", ordinal: 1, node_type: "subquestion" }),
      row({ id: "q2a", node_key: "Q2(a)", ordinal: 1, node_type: "subquestion" }),
      row({ id: "q3a", node_key: "Q3(a)", ordinal: 1, node_type: "subquestion" }),
      row({ id: "q1b", node_key: "Q1(b)", ordinal: 2, node_type: "subquestion" }),
      row({ id: "q2", node_key: "Q2", ordinal: 2, response_mode: "none" }),
      row({ id: "q3", node_key: "Q3", ordinal: 3, response_mode: "none" }),
      row({ id: "q7aii", node_key: "Q7(a)(ii)", ordinal: 2, node_type: "part" }),
      row({ id: "q7ai", node_key: "Q7(a)(i)", ordinal: 1, node_type: "part" }),
      row({ id: "q10", node_key: "Q10", ordinal: 10 }),
      row({ id: "q9", node_key: "Q9", ordinal: 9 }),
    ]);

    expect(flattenMarkingTree(tree).map((node) => node.node_key)).toEqual([
      "Q1",
      "Q1(a)",
      "Q1(b)",
      "Q2",
      "Q2(a)",
      "Q3",
      "Q3(a)",
      "Q7",
      "7(a)",
      "Q7(a)(i)",
      "Q7(a)(ii)",
      "Q9",
      "Q10",
    ]);
    expect(getSelectableMarkingGroups(tree).map((node) => node.node_key)).toEqual(["Q1", "Q2", "Q3", "Q7", "Q9", "Q10"]);
  });

  it("orders nested grandchildren before moving to the next sibling", () => {
    const tree = buildMarkingTree([
      row({ id: "q3ai", node_key: "Q3(a)(i)", ordinal: 1, node_type: "part" }),
      row({ id: "q3", node_key: "Q3", ordinal: 3, response_mode: "none" }),
      row({ id: "q3bi", node_key: "Q3(b)(i)", ordinal: 1, node_type: "part" }),
      row({ id: "q3a", node_key: "Q3(a)", ordinal: 1, node_type: "subquestion", response_mode: "none" }),
      row({ id: "q3aii", node_key: "Q3(a)(ii)", ordinal: 2, node_type: "part" }),
      row({ id: "q3b", node_key: "Q3(b)", ordinal: 2, node_type: "subquestion", response_mode: "none" }),
    ]);

    expect(flattenMarkingTree(tree).map((node) => node.node_key)).toEqual([
      "Q3",
      "Q3(a)",
      "Q3(a)(i)",
      "Q3(a)(ii)",
      "Q3(b)",
      "Q3(b)(i)",
    ]);
  });

  it("repairs the observed flat AI ordering into root-question groups", () => {
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

    const tree = buildMarkingTree(badKeys.map((nodeKey, index) => row({
      id: `node-${index}`,
      node_key: nodeKey,
      ordinal: index + 1,
      node_type: nodeKey.includes("(") ? "subquestion" : "question",
      response_mode: "none",
    })));

    expect(flattenMarkingTree(tree).map((node) => node.node_key)).toEqual([
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
    expect(getSelectableMarkingGroups(tree).map((node) => node.node_key)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
  });

  it("marks only leaf response nodes and rolls totals up recursively", () => {
    const [question] = buildMarkingTree([
      row({ id: "q4", node_key: "Q4", ordinal: 4, response_mode: "none", marks: 10 }),
      row({ id: "q4a", node_key: "4(a)", parent_node_id: "q4", ordinal: 1, node_type: "subquestion", response_mode: "none", marks: 4 }),
      row({ id: "q4ai", node_key: "4(a)(i)", parent_node_id: "q4a", ordinal: 1, node_type: "part", marks: 2 }),
      row({ id: "q4aii", node_key: "4(a)(ii)", parent_node_id: "q4a", ordinal: 2, node_type: "part", marks: 2 }),
      row({ id: "q4b", node_key: "4(b)", parent_node_id: "q4", ordinal: 2, node_type: "subquestion", marks: 6 }),
    ]);

    expect(question).toBeDefined();
    expect(isMarkableMarkingNode(question!)).toBe(false);
    expect(getMarkableLeafNodes(question!).map((node) => node.node_key)).toEqual(["4(a)(i)", "4(a)(ii)", "4(b)"]);

    const totals = computeMarkingTotals(question!, [
      mark("q4", 10),
      mark("q4ai", 1),
      mark("q4aii", 2),
      mark("q4b", 5),
    ]);

    expect(totals.awarded).toBe(8);
    expect(totals.max).toBe(10);
    expect(totals.markedLeafCount).toBe(3);
    expect(totals.markableLeafCount).toBe(3);
    expect(totals.hasExplicitTotalMismatch).toBe(false);
  });

  it("allows mark-only subpart leaves with response_mode none", () => {
    const [question] = buildMarkingTree([
      row({ id: "q5", node_key: "Q5", ordinal: 5, response_mode: "none", marks: 4 }),
      row({ id: "q5a", node_key: "5(a)", parent_node_id: "q5", ordinal: 1, node_type: "subquestion", response_mode: "none", marks: 2 }),
      row({ id: "q5b", node_key: "5(b)", parent_node_id: "q5", ordinal: 2, node_type: "subquestion", response_mode: "none", marks: 2 }),
    ]);

    expect(getMarkableLeafNodes(question!).map((node) => node.node_key)).toEqual(["5(a)", "5(b)"]);
    expect(computeMarkingTotals(question!, [mark("q5a", 2), mark("q5b", 1)])).toMatchObject({
      awarded: 3,
      max: 4,
      markableLeafCount: 2,
    });
  });

  it("sums attempt totals from root questions only without double-counting parents", () => {
    const tree = buildMarkingTree([
      row({ id: "q1", node_key: "Q1", ordinal: 1, response_mode: "none", marks: 5 }),
      row({ id: "q1a", node_key: "1(a)", parent_node_id: "q1", ordinal: 1, node_type: "subquestion", marks: 2 }),
      row({ id: "q1b", node_key: "1(b)", parent_node_id: "q1", ordinal: 2, node_type: "subquestion", marks: 3 }),
      row({ id: "q2", node_key: "Q2", ordinal: 2, marks: 4 }),
    ]);

    const totals = calculateAttemptTotal(tree, [mark("q1", 5), mark("q1a", 2), mark("q1b", 1), mark("q2", 4)]);
    expect(totals.awarded).toBe(7);
    expect(totals.max).toBe(9);
  });

  it("derives ordinal paths from nested keys", () => {
    expect(ordinalPathForQuestionKey("Q3(a)(ii)")).toEqual([3, 1, 2]);
    expect(ordinalPathForQuestionKey("10(b)(iv)")).toEqual([10, 2, 4]);
  });

  it("classifies covers and markscheme instructions before question extraction", () => {
    expect(classifyDocumentSection("Instructions to candidates\nDo not open this paper until instructed.")).toBe("instructions");
    expect(classifyDocumentSection("Formula sheet\nArea of a circle = pi r^2")).toBe("formula_sheet");
    expect(classifyDocumentSection("1. Solve the equation x^2 = 4.")).toBe("question_page");
    expect(classifyDocumentSection("Markscheme\nGeneral marking instructions: award marks according to...", "markscheme")).toBe("markscheme_instructions");
    expect(classifyDocumentSection("Question 3\n(a) M1 for method, A1 for answer", "markscheme")).toBe("markscheme_question_page");
  });
});

function row(overrides: Partial<QuestionNodeRow>): QuestionNodeRow {
  return {
    id: "id",
    assessment_version_id: "version",
    parent_node_id: null,
    node_key: "Q1",
    ordinal: 1,
    node_type: "question",
    title: null,
    prompt_html: null,
    prompt_latex: null,
    marks: 1,
    response_mode: "typed_or_upload",
    interaction_json: null,
    markscheme_html: null,
    assets: [],
    source_page_start: null,
    source_page_end: null,
    created_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function mark(questionNodeId: string, awardedMarks: number): Pick<Mark, "question_node_id" | "awarded_marks"> {
  return { question_node_id: questionNodeId, awarded_marks: awardedMarks };
}
