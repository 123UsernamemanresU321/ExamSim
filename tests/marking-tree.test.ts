import { describe, expect, it } from "vitest";
import {
  buildMarkingTree,
  computeMarkingTotals,
  getMarkableLeafNodes,
  getSelectableMarkingGroups,
  isMarkableMarkingNode,
} from "@/lib/marking-tree";
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
