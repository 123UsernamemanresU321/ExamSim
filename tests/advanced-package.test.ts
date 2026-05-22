import { describe, expect, it } from "vitest";
import { buildRootQuestionMarkingContext } from "@/lib/marking-context-core";
import { computePaperHealth } from "@/lib/paper-health";
import { buildQuestionBankChildTree, extractQuestionBankDrafts, selectQuestionBankItems } from "@/lib/question-bank";
import type { AttemptReviewWorkspace } from "@/lib/live-data";
import type { Assessment, AssessmentVersion, QuestionBankItem, QuestionNodeRow } from "@/types/database";

describe("advanced development package", () => {
  it("blocks paper health when upload slots are attached to subquestions", () => {
    const nodes = [
      questionNode("root", "Q1", null, 1, [1]),
      questionNode("child", "1(a)", "root", 2, [1, 1]),
    ];
    const summary = computePaperHealth({
      assessment: { id: "assessment", title: "Paper", paper_code: "P1" },
      version: { id: "version", status: "draft", source_object_path: "private.pdf", markscheme_pdf_path: null, markscheme_source_object_path: null },
      questionNodes: nodes,
      uploadSlots: [{ question_node_id: "child" }],
    });
    expect(summary.status).toBe("blocked");
    expect(summary.blockers.map((item) => item.code)).toContain("non_root_upload_slot");
  });

  it("builds a root-question marking context from one source object", () => {
    const workspace = reviewWorkspace([
      questionNode("q3", "Q3", null, 1, [3], 5),
      questionNode("q3a", "3(a)", "q3", 2, [3, 1], 2),
      questionNode("q3b", "3(b)", "q3", 3, [3, 2], 3),
    ]);
    const context = buildRootQuestionMarkingContext(workspace, "q3");

    expect(context.rootQuestion?.node_key).toBe("Q3");
    expect(context.markableLeafNodes.map((node) => node.node_key)).toEqual(["3(a)", "3(b)"]);
    expect(context.uploadSlot?.question_node_id).toBe("q3");
    expect(context.totals.root).toMatchObject({ max: 5 });
  });

  it("extracts question bank drafts preserving children and source pages", () => {
    const assessment = { title: "Mechanics Test", paper_code: "PHY-P2", subject: "Physics", assessment_kind: "test" } as Assessment;
    const version = { source_object_path: "owner/source.pdf" } as AssessmentVersion;
    const drafts = extractQuestionBankDrafts({
      assessment,
      version,
      questionNodes: [
        questionNode("q1", "Q1", null, 1, [1], 4),
        questionNode("q1a", "1(a)", "q1", 2, [1, 1], 2),
        questionNode("q1b", "1(b)", "q1", 3, [1, 2], 2),
      ],
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rootNodeKey).toBe("Q1");
    expect(drafts[0]?.children.map((child) => child.node_key)).toEqual(["1(a)", "1(b)"]);
    expect(drafts[0]?.sourceObjectPath).toBe("owner/source.pdf");
  });

  it("selects reusable question bank items against generation criteria", () => {
    const items = [
      bankItem("a", 12, "Physics", ["mechanics"], 3),
      bankItem("b", 8, "Physics", ["waves"], 2),
      bankItem("c", 10, "Math", ["mechanics"], 4),
    ];
    const selection = selectQuestionBankItems(items, { subject: "Physics", topicTags: ["mechanics"], targetMarks: 12 });
    expect(selection.selectedItems.map((item) => item.id)).toEqual(["a"]);
    expect(selection.totalMarks).toBe(12);
  });

  it("computes question bank parent marks from nested children and repairs legacy parent UUIDs", () => {
    const tree = buildQuestionBankChildTree([
      bankChild("1(b)", null, [1, 2], null),
      bankChild("1(b)(i)", "legacy-uuid-parent-that-will-not-match", [1, 2, 1], 2),
      bankChild("1(b)(ii)", "legacy-uuid-parent-that-will-not-match", [1, 2, 2], 2),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.node_key).toBe("1(b)");
    expect(tree[0]?.computed_marks_available).toBe(4);
    expect(tree[0]?.mark_source).toBe("computed");
    expect(tree[0]?.children.map((child) => child.node_key)).toEqual(["1(b)(i)", "1(b)(ii)"]);
  });
});

function questionNode(
  id: string,
  nodeKey: string,
  parentNodeId: string | null,
  ordinal: number,
  ordinalPath: number[],
  marks = 1,
): QuestionNodeRow {
  return {
    id,
    assessment_version_id: "version",
    parent_node_id: parentNodeId,
    root_question_id: ordinalPath.length ? `Q${ordinalPath[0]}` : null,
    node_key: nodeKey,
    display_label: nodeKey,
    depth: ordinalPath.length - 1,
    ordinal_path: ordinalPath,
    sort_key: ordinalPath.join("."),
    ordinal,
    node_type: ordinalPath.length === 1 ? "question" : "subquestion",
    title: null,
    prompt_html: `Prompt ${nodeKey}`,
    prompt_latex: null,
    marks,
    response_mode: ordinalPath.length === 1 ? "upload_pdf" : "none",
    interaction_json: null,
    markscheme_html: null,
    assets: [],
    source_page_start: 2,
    source_page_end: 2,
    source_region_json: null,
    has_visual_assets: false,
    visual_asset_refs: [],
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function reviewWorkspace(questionNodes: QuestionNodeRow[]): AttemptReviewWorkspace {
  return {
    attempt: null,
    questionNodes,
    uploadSlots: [
      {
        id: "slot",
        attempt_id: "attempt",
        question_node_id: "q3",
        required: true,
        object_path: "uploads/q3.pdf",
        original_file_name: "q3.pdf",
        uploaded_at: "2026-01-01T00:00:00.000Z",
        file_size_bytes: 100,
        content_type: "application/pdf",
        confirmed_by_profile_id: null,
        locked_at: null,
        annotated_object_path: null,
        annotated_generated_at: null,
        is_blank_placeholder: false,
        status: "uploaded",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    textResponses: [],
    moderationReport: null,
    attemptEvents: [],
    package: null,
    packageError: null,
    marks: [],
    annotations: [],
    workAnnotations: [],
    markingTickets: [],
    markingTicketMessages: [],
    uploadUrls: {},
    annotatedUploadUrls: {},
    feedbackRelease: null,
    markschemeHtml: null,
    markschemePdfPath: null,
    sourceObjectPath: "source.pdf",
    uploadSanityChecks: [],
    commentBank: [],
  };
}

function bankItem(id: string, marks: number, subject: string, tags: string[], difficulty: number): QuestionBankItem {
  return {
    id,
    owner_profile_id: "owner",
    source_assessment_id: null,
    source_assessment_version_id: null,
    source_question_node_id: null,
    title: id,
    root_node_key: `Q${id}`,
    prompt_html: null,
    prompt_latex: null,
    source_pdf_object_path: null,
    source_page_start: null,
    source_page_end: null,
    source_region_json: null,
    marks_available: marks,
    estimated_difficulty: difficulty,
    assessment_kind: "test",
    subject,
    paper_code: null,
    tags,
    topic_tag_ids: [],
    has_visual_assets: false,
    visual_asset_refs: [],
    answer_mode: "upload_pdf",
    markscheme_html: null,
    markscheme_refs: [],
    do_not_reuse: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function bankChild(nodeKey: string, parentNodeKey: string | null, ordinalPath: number[], marks: number | null) {
  return {
    id: nodeKey,
    question_bank_item_id: "item",
    node_key: nodeKey,
    parent_node_key: parentNodeKey,
    ordinal_path: ordinalPath,
    prompt_html: `$${nodeKey}$`,
    prompt_latex: null,
    marks_available: marks,
    markscheme_html: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}
