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
  "institution_role_matrix",
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

  it("tracks Export Hub as the safe fallback for school reporting and interoperability", () => {
    const readiness = getExamsimProductionReadiness({});
    expect(readiness.find((item) => item.key === "institution_role_matrix")?.status).toBe("staging_required");
    expect(readiness.find((item) => item.key === "institution_role_matrix")?.ownerMessage).toContain("RLS-protected membership table");
    expect(readiness.find((item) => item.key === "school_reporting")?.status).toBe("manual_fallback");
    expect(readiness.find((item) => item.key === "school_reporting")?.fallback).toContain("Export Hub");
    expect(readiness.find((item) => item.key === "qti_moodle_interop")?.ownerMessage).toContain("Moodle XML is intentionally blocked");
  });

  it("surfaces the production-readiness panel in owner security", () => {
    const page = readFileSync("app/owner/security/page.tsx", "utf8");
    const panel = readFileSync("components/owner/examsim-production-readiness-panel.tsx", "utf8");
    const rolePanel = readFileSync("components/owner/institution-role-matrix-panel.tsx", "utf8");
    const providerPanel = readFileSync("components/owner/provider-readiness-dashboard.tsx", "utf8");
    expect(page).toContain("ExamsimProductionReadinessPanel");
    expect(page).toContain("ProviderReadinessDashboard");
    expect(page).toContain("InstitutionRoleMatrixPanel");
    expect(page).not.toContain(".or(");
    expect(panel).toContain("Production readiness matrix");
    expect(panel).toContain("Smart Import / Exam Compiler");
    expect(panel).toContain("Guest SEB / Lockdown");
    expect(rolePanel).toContain("Institution role matrix");
    expect(providerPanel).toContain("Provider and import readiness");
    expect(providerPanel).toContain("Import job states");
    expect(providerPanel).toContain("Cost, quota, and audit guardrails");
  });

  it("surfaces V3 export governance through the owner Export Hub", () => {
    const page = readFileSync("app/owner/export-hub/page.tsx", "utf8");
    const sidebar = readFileSync("components/owner/sidebar-nav.tsx", "utf8");
    expect(page).toContain("Export Hub");
    expect(page).toContain("Moodle XML is not exposed as a working export");
    expect(page).toContain("ExportHubDownloads");
    expect(sidebar).toContain('href: "/owner/export-hub"');
  });
});
