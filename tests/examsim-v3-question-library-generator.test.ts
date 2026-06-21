import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectQuestionBankItems } from "@/lib/question-bank";
import type { QuestionBankItem } from "@/types/database";

function item(overrides: Partial<QuestionBankItem>): QuestionBankItem {
  return {
    id: "q1", owner_profile_id: "owner", source_assessment_id: null, source_assessment_version_id: null,
    source_question_node_id: null, title: "Question", root_node_key: "1", prompt_html: "<p>Calculate x</p>", prompt_latex: null,
    source_pdf_object_path: null, source_page_start: null, source_page_end: null, source_region_json: null,
    marks_available: 5, estimated_difficulty: 3, assessment_kind: "exam", subject: "Mathematics", paper_code: "P1",
    tags: ["algebra"], topic_tag_ids: [], has_visual_assets: false, visual_asset_refs: [], answer_mode: "numerical",
    markscheme_html: null, markscheme_refs: [], do_not_reuse: false, created_at: "2026-01-01", updated_at: "2026-01-01",
    subtopic: "linear", year: 2026, paper_type: "Paper 1", command_term: "calculate", curriculum_standard_ids: [],
    interaction_json: null, performance_stats_json: {}, content_fingerprint: "fingerprint", readiness_status: "ready", source_history_json: [], rubric_json: [],
    ...overrides,
  } as QuestionBankItem;
}

describe("Examsim V3 Question Library and Mock Generator", () => {
  it("adds provenance, duplicate, standards, readiness, and blueprint metadata", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.includes("v3_question_library_blueprints"));
    expect(file).toBeTruthy();
    const migration = readFileSync(`supabase/migrations/${file}`, "utf8");
    for (const column of ["content_fingerprint", "readiness_status", "source_history_json", "curriculum_standard_ids", "command_term", "paper_type", "performance_stats_json"]) {
      expect(migration).toContain(column);
    }
  });

  it("preserves canonical response modes and source regions during extraction", () => {
    const action = readFileSync("app/owner/question-bank/import-from-assessment/page.tsx", "utf8");
    const helper = readFileSync("lib/question-bank.ts", "utf8");
    expect(action).not.toContain('answer_mode: "upload_pdf"');
    expect(action).toContain("contentFingerprintForQuestion");
    expect(action).toContain("source_region_json");
    expect(helper).toContain("sourceRegions");
    expect(helper).toContain("answerMode");
  });

  it("filters blueprints by topic, difficulty, command term, paper type, standards, and exclusions", () => {
    const selected = selectQuestionBankItems([
      item({ id: "keep", curriculum_standard_ids: ["std-1"] }),
      item({ id: "wrong-command", command_term: "explain" }),
      item({ id: "wrong-standard", curriculum_standard_ids: ["std-2"] }),
    ], {
      subject: "Mathematics",
      topicTags: ["algebra"],
      targetMarks: 5,
      difficultyMin: 2,
      difficultyMax: 4,
      commandTerms: ["calculate"],
      paperTypes: ["Paper 1"],
      standardIds: ["std-1"],
      avoidQuestionIds: ["not-this-one"],
    });
    expect(selected.selectedItems.map((entry) => entry.id)).toEqual(["keep"]);
  });

  it("provides a generated-paper review, replacement, health, and draft conversion workflow", () => {
    const page = readFileSync("app/owner/paper-generator/[paperId]/page.tsx", "utf8");
    const actions = readFileSync("app/owner/paper-generator/[paperId]/actions.ts", "utf8");
    expect(page).toContain("Blueprint health");
    expect(page).toContain("Replace question");
    expect(actions).toContain("replaceGeneratedPaperQuestionAction");
    expect(actions).toContain("convertGeneratedPaperToAssessmentAction");
    expect(actions).toContain('requireInstitutionPermission("assessment_authoring"');
    expect(actions).toContain("question_nodes");
  });
});
