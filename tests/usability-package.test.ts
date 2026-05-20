import { describe, expect, it } from "vitest";
import { applyAssessmentPreset, DEFAULT_ASSESSMENT_PRESETS } from "@/lib/assessment-templates";
import { classifyMarkingQueueRow, markingProgress } from "@/lib/marking-queue";
import { buildModerationTimeline, groupModerationTimeline } from "@/lib/moderation-timeline";
import { buildSubmissionReceipt } from "@/lib/submission-receipt";
import { analyzePdfUploadMetadata, estimatePdfPageCountFromBytes } from "@/lib/upload-sanity";
import { generateWeaknessRecommendations } from "@/lib/weakness-calendar";
import type { Attempt, QuestionNodeRow, TopicTag, UploadSanityCheck, UploadSlot } from "@/types/database";

describe("usability upgrade utilities", () => {
  it("sanity checks a renderable PDF-like upload and records page count warnings", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n/Type /Page\n/Type /Page\n%%EOF");
    expect(estimatePdfPageCountFromBytes(bytes)).toBe(2);

    const result = analyzePdfUploadMetadata({
      fileName: "q1.pdf",
      contentType: "application/pdf",
      fileSizeBytes: bytes.byteLength,
      pageCount: 2,
      duplicateFileHashCount: 1,
    });

    expect(result.status).toBe("needs_review");
    expect(result.pageCount).toBe(2);
    expect(result.warnings.map((warning) => warning.code)).toContain("very_small_file");
  });

  it("flags missing or invalid uploads without pretending Edge has full OCR analysis", () => {
    const result = analyzePdfUploadMetadata({
      fileName: "answer.txt",
      contentType: "text/plain",
      fileSizeBytes: 0,
      pageCount: 0,
    });

    expect(result.status).toBe("failed");
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["not_pdf_content_type", "not_pdf_extension", "empty_file", "zero_pages"]));
  });

  it("classifies queue rows into triage sections and calculates progress", () => {
    const row = {
      attempt_id: "att_1",
      assessment_title: "Mock",
      paper_code: "P1",
      student_name: "Student",
      missing_upload_slots: 1,
      uploaded_slots: 2,
      total_upload_slots: 3,
      mark_count: 4,
      markable_leaf_count: 8,
      feedback_released: false,
      moderation_severity: "high",
      incident_affected: true,
    };

    expect(classifyMarkingQueueRow(row)).toEqual(["missing_uploads", "high_moderation_signal", "incident_affected", "partially_marked"]);
    expect(markingProgress(row)).toBe(50);
  });

  it("groups moderation events, incidents, and accommodations by exam phase", () => {
    const attempt = attemptFixture();
    const timeline = buildModerationTimeline({
      attempt,
      events: [
        { id: "e1", event_type: "fullscreen.exit", server_received_at: "2026-05-20T08:30:00.000Z", payload_json: {} },
        { id: "e2", event_type: "upload.completed", server_received_at: "2026-05-20T09:40:00.000Z", payload_json: {} },
      ],
      incidents: [{ id: "i1", incident_type: "internet_issue", description: "Router reset.", severity: "medium", created_at: "2026-05-20T08:45:00.000Z" }],
      accommodations: [{ id: "a1", accommodation_type: "upload_extension", reason: "Extra upload time approved.", applied_at: "2026-05-20T09:35:00.000Z" }],
    });

    expect(timeline.map((item) => item.eventType)).toEqual([
      "fullscreen.exit",
      "incident.internet_issue",
      "accommodation.upload_extension",
      "upload.completed",
    ]);
    const grouped = groupModerationTimeline(timeline);
    expect(grouped.find((group) => group.phase === "active_writing")?.events).toHaveLength(2);
    expect(grouped.find((group) => group.phase === "upload_only")?.events).toHaveLength(2);
  });

  it("applies assessment presets to publish settings", () => {
    const preset = DEFAULT_ASSESSMENT_PRESETS.find((item) => item.name === "Olympiad proof paper");
    expect(preset).toBeTruthy();
    expect(applyAssessmentPreset({ duration_seconds: 60 }, preset!)).toMatchObject({
      assessment_kind: "exam",
      duration_seconds: 10800,
      per_question_upload_enabled: true,
      require_blank_for_skipped: true,
    });
  });

  it("builds a student submission receipt from root upload slots and sanity checks", () => {
    const slot = uploadSlotFixture({ id: "slot_1", question_node_id: "q1", original_file_name: "q1.pdf", status: "uploaded" });
    const sanity = sanityFixture({ upload_slot_id: "slot_1", page_count: 4 });
    const receipt = buildSubmissionReceipt({
      attempt: { id: "attempt-receipt", title: "Paper", paper_code: "P1" },
      uploadSlots: [slot],
      sanityChecks: [sanity],
      finalizedAt: "2026-05-20T10:00:00.000Z",
    });

    expect(receipt.slots[0]).toMatchObject({ question_node_id: "q1", file_name: "q1.pdf", page_count: 4 });
  });

  it("creates weak-topic calendar recommendations from low scoring linked questions", () => {
    const tag: TopicTag = {
      id: "tag_1",
      owner_profile_id: "owner_1",
      subject: "Physics",
      tag: "Mechanics",
      parent_tag_id: null,
      created_at: "2026-05-20T00:00:00.000Z",
    };
    const recommendations = generateWeaknessRecommendations({
      ownerProfileId: "owner_1",
      studentProfileId: "student_1",
      assessmentId: "assessment_1",
      paperCode: "PHY-P1",
      questionNodes: [questionNodeFixture({ id: "q1", marks: 10 })],
      marks: [{ question_node_id: "q1", awarded_marks: 3 }],
      topicLinks: [{ question_node_id: "q1", topic_tag_id: "tag_1", weight: 1 }],
      topicTags: [tag],
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].reason).toContain("Mechanics");
    expect(recommendations[0].priority).toBe("high");
  });
});

function attemptFixture(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "attempt_1",
    assessment_id: "assessment_1",
    assessment_version_id: "version_1",
    assessment_assignment_id: null,
    assignee_profile_id: "student_1",
    start_at_utc: "2026-05-20T08:00:00.000Z",
    duration_seconds: 3600,
    end_at_utc: "2026-05-20T09:00:00.000Z",
    upload_deadline_at_utc: "2026-05-20T10:00:00.000Z",
    display_timezone: "Africa/Johannesburg",
    delivery_mode: "browser",
    solutions_requested: true,
    typed_enabled: true,
    per_question_upload_enabled: true,
    require_blank_for_skipped: true,
    seb_browser_exam_key_hashes: [],
    seb_config_key_hashes: [],
    seb_config_path: null,
    state_cache: null,
    created_at: "2026-05-20T07:00:00.000Z",
    updated_at: "2026-05-20T07:00:00.000Z",
    ...overrides,
  };
}

function questionNodeFixture(overrides: Partial<QuestionNodeRow> = {}): QuestionNodeRow {
  return {
    id: "q1",
    assessment_version_id: "version_1",
    parent_node_id: null,
    node_key: "Q1",
    ordinal: 1,
    node_type: "question",
    title: null,
    prompt_html: null,
    prompt_latex: null,
    marks: 10,
    response_mode: "typed_or_upload",
    interaction_json: null,
    markscheme_html: null,
    assets: [],
    source_page_start: null,
    source_page_end: null,
    created_at: "2026-05-20T00:00:00.000Z",
    ...overrides,
  };
}

function uploadSlotFixture(overrides: Partial<UploadSlot> = {}): UploadSlot {
  return {
    id: "slot_1",
    attempt_id: "attempt_1",
    question_node_id: "q1",
    required: true,
    object_path: "uploads/q1.pdf",
    original_file_name: "q1.pdf",
    uploaded_at: "2026-05-20T09:30:00.000Z",
    file_size_bytes: 1024,
    content_type: "application/pdf",
    confirmed_by_profile_id: "student_1",
    locked_at: null,
    annotated_object_path: null,
    annotated_generated_at: null,
    is_blank_placeholder: false,
    status: "uploaded",
    created_at: "2026-05-20T09:00:00.000Z",
    updated_at: "2026-05-20T09:30:00.000Z",
    ...overrides,
  };
}

function sanityFixture(overrides: Partial<UploadSanityCheck> = {}): UploadSanityCheck {
  return {
    id: "sanity_1",
    upload_slot_id: "slot_1",
    status: "accepted",
    file_name: "q1.pdf",
    file_size_bytes: 1024,
    file_hash: "abc",
    content_type: "application/pdf",
    page_count: 1,
    preview_object_path: null,
    warnings_json: [],
    checks_json: {},
    created_at: "2026-05-20T09:31:00.000Z",
    ...overrides,
  };
}
