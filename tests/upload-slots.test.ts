import { describe, expect, it } from "vitest";
import { collectUploadSlotNodeIds } from "@/lib/upload-slots";
import { buildNormalizedQuestionTree } from "@/lib/question-hierarchy";
import type { QuestionNode } from "@/lib/assessment-package";

describe("collectUploadSlotNodeIds", () => {
  it("returns only root question upload slot ids in tree order", () => {
    const nodes: QuestionNode[] = [
      {
        node_id: "q1",
        node_key: "1",
        ordinal: 1,
        node_type: "question",
        response_mode: "typed_or_upload",
        children: [
          {
            node_id: "q1a",
            node_key: "1(a)",
            ordinal: 1,
            node_type: "subquestion",
            response_mode: "upload_pdf",
          },
          {
            node_id: "q1b",
            node_key: "1(b)",
            ordinal: 2,
            node_type: "subquestion",
            response_mode: "typed_text",
          },
        ],
      },
      {
        node_id: "q2",
        node_key: "2",
        ordinal: 2,
        node_type: "question",
        response_mode: "none",
      },
    ];

    expect(collectUploadSlotNodeIds(nodes)).toEqual(["q1", "q2"]);
  });

  it("creates a main-question slot when only a nested subpart needs upload", () => {
    const nodes: QuestionNode[] = [
      {
        node_id: "q3",
        node_key: "Q3",
        ordinal: 3,
        node_type: "question",
        response_mode: "none",
        children: [
          {
            node_id: "q3a",
            node_key: "3(a)",
            ordinal: 1,
            node_type: "subquestion",
            response_mode: "none",
            children: [
              {
                node_id: "q3ai",
                node_key: "3(a)(i)",
                ordinal: 1,
                node_type: "part",
                response_mode: "typed_or_upload",
              },
            ],
          },
        ],
      },
    ];

    expect(collectUploadSlotNodeIds(nodes)).toEqual(["q3"]);
  });

  it("uses repaired root questions for flat AI output instead of subquestion slots", () => {
    const repaired = buildNormalizedQuestionTree([
      { node_id: "q1a", node_key: "1(a)", response_mode: "upload_pdf" },
      { node_id: "q1bi", node_key: "1(b)(i)", response_mode: "upload_pdf" },
      { node_id: "q1", node_key: "Q1", response_mode: "upload_pdf" },
      { node_id: "q2a", node_key: "2(a)", response_mode: "upload_pdf" },
      { node_id: "q2", node_key: "Q2", response_mode: "upload_pdf" },
    ]);

    expect(collectUploadSlotNodeIds(repaired.tree as unknown as QuestionNode[])).toEqual(["q1", "q2"]);
    expect(repaired.flat.filter((node) => node.depth > 0).map((node) => node.response_mode)).toEqual(["none", "none", "none", "none"]);
  });
});
