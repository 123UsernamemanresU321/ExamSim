import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXAMSIM_PRODUCTION_FEATURE_KEYS,
  getExamsimProductionReadiness,
  summarizeExamsimProductionReadiness,
} from "@/lib/examsim-production-readiness";

const EXPECTED_FEATURE_KEYS = [
  "smart_import_compiler",
  "ocr_question_detection",
  "markscheme_rubrics",
  "ai_answer_grouping",
  "guest_seb_lockdown",
  "paper_mode",
  "stem_handwriting_ocr",
  "collaborative_grading",
  "live_invigilation",
  "guest_upload_recovery",
  "offline_resilience",
  "teacher_analytics",
  "question_bank_generator",
  "student_claim_flow",
  "source_pdf_health",
  "accommodations_matrix",
  "subject_tools",
  "curriculum_alignment",
  "qti_moodle_interop",
  "version_history_rollback",
  "school_reporting",
  "deployment_validation",
] as const;

describe("Examsim production-readiness matrix", () => {
  it("covers every remaining product-spec feature with honest status and fallback or blocker text", () => {
    expect(EXAMSIM_PRODUCTION_FEATURE_KEYS).toEqual(EXPECTED_FEATURE_KEYS);
    const readiness = getExamsimProductionReadiness({});
    expect(readiness.map((item) => item.key)).toEqual(EXPECTED_FEATURE_KEYS);
    expect(readiness.map((item) => item.status)).not.toContain("unknown");
    for (const item of readiness) {
      expect(item.ownerMessage.length).toBeGreaterThan(20);
      if (item.status !== "ready") {
        expect(`${item.fallback ?? ""}${item.blocker ?? ""}${item.requiredEnvVars.join(",")}`.length).toBeGreaterThan(0);
      }
    }
  });

  it("promotes provider-backed Smart Import/OCR capabilities only when required env vars are present", () => {
    const withoutProviders = getExamsimProductionReadiness({});
    expect(withoutProviders.find((item) => item.key === "smart_import_compiler")?.status).toBe("provider_required");
    expect(withoutProviders.find((item) => item.key === "ocr_question_detection")?.status).toBe("provider_required");

    const withProviders = getExamsimProductionReadiness({
      DEEPSEEK_API_KEY: "set",
      MINERU_API_KEY: "set",
    });
    expect(withProviders.find((item) => item.key === "smart_import_compiler")?.status).toBe("ready");
    expect(withProviders.find((item) => item.key === "ocr_question_detection")?.status).toBe("provider_ready_needs_staging");
  });

  it("summarizes readiness for owner-facing deployment decisions", () => {
    const summary = summarizeExamsimProductionReadiness(getExamsimProductionReadiness({}));
    expect(summary.total).toBe(EXPECTED_FEATURE_KEYS.length);
    expect(summary.providerRequired).toBeGreaterThan(0);
    expect(summary.blocked).toBeGreaterThan(0);
    expect(summary.ready + summary.providerReadyNeedsStaging + summary.providerRequired + summary.manualFallback + summary.blocked + summary.stagingRequired).toBe(summary.total);
  });

  it("surfaces the production-readiness panel in owner security", () => {
    const page = readFileSync("app/owner/security/page.tsx", "utf8");
    const panel = readFileSync("components/owner/examsim-production-readiness-panel.tsx", "utf8");
    expect(page).toContain("ExamsimProductionReadinessPanel");
    expect(panel).toContain("Production readiness matrix");
    expect(panel).toContain("Smart Import / Exam Compiler");
    expect(panel).toContain("Guest SEB / Lockdown");
  });
});
