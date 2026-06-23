import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Examsim V3 Smart Import visual review", () => {
  it("keeps proposal JSON under Advanced and renders field-level review controls", () => {
    const panel = read("components/owner/ai-parse-review-panel.tsx");
    expect(panel).toContain("Structured proposal review");
    expect(panel).toContain("Use suggestion");
    expect(panel).toContain("Keep current");
    expect(panel).toContain("allFieldsReviewed");
    expect(panel).toContain("Corrected question text");
    expect(panel).toContain("Source anchor");
    expect(panel).toContain("Rubric draft");
    expect(panel).toContain("Advanced JSON");
    expect(panel).not.toContain('Field label="AI normalized package proposal"');
  });

  it("applies reviewed fields only through deterministic repair on a mutable version", () => {
    const panel = read("components/owner/ai-parse-review-panel.tsx");
    const edge = read("supabase/functions/update-question-tree/index.ts");
    expect(panel).toContain("selected_fields");
    expect(panel).toContain("suggestion_id");
    expect(edge).toContain("repairFlatNodeHierarchy");
    expect(edge).toContain("assertVersionMutable");
    expect(edge).toContain('status: "applied"');
    expect(edge).toContain('"ai_parse.reviewed_applied"');
    expect(edge).toContain("normalizeDraftRegionBbox");
    expect(edge).toContain('from("question_source_regions")');
    expect(edge).toContain('status: "needs_review"');
    expect(edge).toContain("validateReviewedSuggestionDecisions");
    expect(edge).toContain("reviewed_fields");
    expect(edge).toContain("acceptedSuggestionTopicKeys.has(canonicalQuestionKey(node.node_key))");
    expect(edge).toContain('.from("question_topic_links").delete()');
  });
});
