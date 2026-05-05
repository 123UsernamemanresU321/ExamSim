import { describe, expect, it } from "vitest";
import { collectUploadSlotNodeIds } from "@/lib/upload-slots";
import type { QuestionNode } from "@/lib/assessment-package";

describe("collectUploadSlotNodeIds", () => {
  it("returns unique upload-capable question node ids in tree order", () => {
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

    expect(collectUploadSlotNodeIds(nodes)).toEqual(["q1", "q1a"]);
  });
});
