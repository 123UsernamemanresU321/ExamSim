import { describe, expect, it } from "vitest";
import {
  buildCompilerReviewQueue,
  getCompilerProviderStatus,
  inferAnswerTypeSuggestion,
  summarizeCompilerReadiness,
} from "@/lib/examsim/compiler-readiness";
import { computePaperHealth } from "@/lib/paper-health";

const baseQuestion = {
  id: "node-1",
  assessment_version_id: "version-1",
  parent_node_id: null,
  root_question_id: "node-1",
  node_key: "Q1",
  display_label: "Q1",
  depth: 0,
  ordinal: 1,
  ordinal_path: [1],
  node_type: "question" as const,
  title: null,
  prompt_html: "<p>Calculate the value of x and show your working.</p>",
  prompt_latex: null,
  marks: 4,
  marks_available: 4,
  mark_mode: "manual" as const,
  response_mode: "none" as const,
  interaction_json: null,
  markscheme_html: null,
  assets: null,
  source_page_start: null,
  source_page_end: null,
  source_region_json: null,
  has_visual_assets: false,
  visual_asset_refs: [],
  metadata_json: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const baseRegion = {
  id: "region-1",
  assessment_version_id: "version-1",
  source_document_id: "source-1",
  source_page_id: "page-1",
  question_node_id: "node-1",
  node_key: "Q1",
  region_type: "question" as const,
  bbox_json: { normalized: true, page: 1, x: 0.1, y: 0.1, width: 0.4, height: 0.2 },
  confidence: 0.94,
  status: "approved" as const,
  metadata_json: { marks: 4, response_mode: "typed_or_upload" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("Examsim V2 compiler readiness", () => {
  it("infers editable answer type suggestions from prompt command terms", () => {
    expect(inferAnswerTypeSuggestion("State the oxidation number of iron.").responseMode).toBe("typed_text");
    expect(inferAnswerTypeSuggestion("Calculate the momentum and show your working.").responseMode).toBe("typed_or_upload");
    expect(inferAnswerTypeSuggestion("Prove that n squared is odd.").responseMode).toBe("typed_or_upload");
    expect(inferAnswerTypeSuggestion("Draw and label the ray diagram.")).toMatchObject({
      responseMode: "typed_text",
      capabilityKind: "whiteboard",
    });
    expect(inferAnswerTypeSuggestion("Complete the table below.").responseMode).toBe("typed_text");
    expect(inferAnswerTypeSuggestion("Choose the correct option.").responseMode).toBe("multiple_choice");
    expect(inferAnswerTypeSuggestion("Explain why the graph is concave.").responseMode).toBe("typed_text");
  });

  it("reports provider-backed compiler status without pretending missing OCR is available", () => {
    const missing = getCompilerProviderStatus({});
    expect(missing.smartImport.status).toBe("not_configured");
    expect(missing.ocr.status).toBe("not_configured");
    expect(missing.manualFallbackAvailable).toBe(true);
    expect(missing.blockingMessages.join(" ")).toContain("DEEPSEEK_API_KEY");

    const configured = getCompilerProviderStatus({ DEEPSEEK_API_KEY: "set", MINERU_API_KEY: "set" });
    expect(configured.smartImport.status).toBe("configured");
    expect(configured.ocr.status).toBe("configured");
    expect(configured.manualFallbackAvailable).toBe(true);
  });

  it("builds a low-confidence review queue across source regions and question cards", () => {
    const queue = buildCompilerReviewQueue({
      questionNodes: [
        { ...baseQuestion, response_mode: "none", prompt_html: "<p>Calculate the speed.</p>", marks: null, marks_available: null },
      ],
      sourceRegions: [
        { ...baseRegion, confidence: 0.48, status: "detected", metadata_json: {} },
      ],
      markschemeNodes: [
        { status: "needs_review", mapped_question_node_id: null },
      ],
    });

    expect(queue.map((item) => item.code)).toEqual(
      expect.arrayContaining(["low_confidence_region", "missing_marks", "missing_response_type", "unresolved_markscheme"]),
    );
    expect(queue.some((item) => item.severity === "critical")).toBe(true);
  });

  it("summarizes readiness as needs review when critical compiler issues remain", () => {
    const summary = summarizeCompilerReadiness({
      questionNodes: [{ ...baseQuestion, marks: null, response_mode: "none" }],
      sourceRegions: [{ ...baseRegion, confidence: 0.3, status: "needs_review", metadata_json: {} }],
      markschemeNodes: [],
      env: {},
    });

    expect(summary.status).toBe("needs_review");
    expect(summary.criticalCount).toBeGreaterThan(0);
    expect(summary.providerStatus.manualFallbackAvailable).toBe(true);
  });

  it("feeds critical compiler review warnings into paper health", () => {
    const health = computePaperHealth({
      assessment: { id: "assessment-1", title: "Mock", paper_code: "M1" },
      version: { id: "version-1", status: "draft", source_object_path: "source.pdf", markscheme_pdf_path: null, markscheme_source_object_path: "markscheme.pdf" },
      questionNodes: [{ ...baseQuestion, marks: null, response_mode: "none" }],
      sourceDocuments: [{ id: "source-1", status: "review_required", object_path: "source.pdf", metadata_json: { processing_status: "pages_ready" } }],
      sourceRegions: [{ ...baseRegion, confidence: 0.2, status: "needs_review", metadata_json: {} }],
      markschemeNodes: [{ status: "needs_review", mapped_question_node_id: null }],
    });

    expect(health.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(["compiler_review_required", "source_region_missing_marks", "source_region_missing_response_type", "unmatched_markscheme"]),
    );
  });
});
