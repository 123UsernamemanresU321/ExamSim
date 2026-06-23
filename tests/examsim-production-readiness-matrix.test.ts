import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReleaseCandidateReadiness,
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
  "adaptive_revision",
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
    expect(withProviders.find((item) => item.key === "smart_import_compiler")?.status).toBe("live_validation_required");
    expect(withProviders.find((item) => item.key === "ocr_question_detection")?.status).toBe("live_validation_required");
  });

  it("tracks SimpleTeX as the configured OCR path without claiming guest lockdown", () => {
    const readiness = getExamsimProductionReadiness({
      SIMPLETEX_APP_ID: "app-id",
      SIMPLETEX_APP_SECRET: "server-secret",
    });
    expect(readiness.find((item) => item.key === "ocr_question_detection")?.status).toBe("live_validation_required");
    expect(readiness.find((item) => item.key === "stem_handwriting_ocr")?.status).toBe("live_validation_required");
    expect(readiness.find((item) => item.key === "guest_seb_lockdown")?.status).toBe("blocked");
    expect(readiness.find((item) => item.key === "guest_seb_lockdown")?.ownerMessage).toContain("GUEST_SEB_ENABLED");
  });

  it("accepts DeepSeek plus SimpleTeX as the configured Smart Import provider pair without calling it ready", () => {
    const readiness = getExamsimProductionReadiness({
      DEEPSEEK_API_KEY: "set",
      SIMPLETEX_APP_ID: "app-id",
      SIMPLETEX_APP_SECRET: "server-secret",
    });
    expect(readiness.find((item) => item.key === "smart_import_compiler")?.status).toBe("live_validation_required");
    expect(readiness.find((item) => item.key === "smart_import_compiler")?.ownerMessage).toContain("reviewed sample");
  });

  it("summarizes readiness for owner-facing deployment decisions", () => {
    const summary = summarizeExamsimProductionReadiness(getExamsimProductionReadiness({}));
    expect(summary.total).toBe(EXPECTED_FEATURE_KEYS.length);
    expect(summary.providerRequired).toBeGreaterThan(0);
    expect(summary.blocked).toBeGreaterThan(0);
    expect(summary.ready + summary.providerRequired + summary.manualFallback + summary.blocked + summary.liveValidationRequired + summary.stagingRequired + summary.v4Future).toBe(summary.total);
  });

  it("builds a release-candidate readiness summary without overclaiming full V3", () => {
    const candidate = buildReleaseCandidateReadiness(getExamsimProductionReadiness({}));
    expect(candidate.readyForFullV3).toBe(false);
    expect(candidate.blockingCount).toBeGreaterThan(0);
    expect(candidate.providerGatedCount).toBeGreaterThan(0);
    expect(candidate.liveValidationRequiredCount).toBeGreaterThan(0);
    expect(candidate.stagingRequiredCount).toBeGreaterThanOrEqual(0);
    expect(candidate.v4FutureCount).toBeGreaterThanOrEqual(0);
    expect(candidate.remainingItems.map((item) => item.key)).toContain("guest_seb_lockdown");
    expect(candidate.ownerMessage).toContain("Full V3 is not ready");
  });

  it("uses only the strict readiness statuses from the V3 acceptance contract", () => {
    const statuses = getExamsimProductionReadiness({
      DEEPSEEK_API_KEY: "set",
      SIMPLETEX_APP_ID: "set",
      SIMPLETEX_APP_SECRET: "set",
    }).map((item) => item.status);

    expect(statuses).not.toContain("provider_ready_needs_live_validation");
    expect(statuses).toContain("live_validation_required");
    const allowedStatuses = new Set([
      "ready",
      "provider_required",
      "manual_fallback",
      "blocked",
      "live_validation_required",
      "staging_required",
      "v4_future",
    ]);
    expect(statuses.every((status) => allowedStatuses.has(status))).toBe(true);
  });

  it("attaches verifiable implementation evidence to every readiness item", () => {
    const readiness = getExamsimProductionReadiness({});

    for (const item of readiness) {
      const evidence = Object.values(item.evidence).flat();
      expect(evidence.length, `${item.key} has no evidence`).toBeGreaterThan(0);
      expect(evidence.every((entry) => entry.length > 3), `${item.key} has invalid evidence`).toBe(true);
      for (const entry of evidence) {
        if (/^(app|components|lib|supabase|tests)\//.test(entry)) {
          expect(existsSync(entry), `${item.key} references missing evidence: ${entry}`).toBe(true);
        }
      }
    }
  });

  it("tracks Export Hub as the safe fallback for school reporting and interoperability", () => {
    const readiness = getExamsimProductionReadiness({});
    expect(readiness.find((item) => item.key === "institution_role_matrix")?.status).toBe("live_validation_required");
    expect(readiness.find((item) => item.key === "institution_role_matrix")?.ownerMessage).toContain("RLS-protected membership table");
    expect(readiness.find((item) => item.key === "school_reporting")?.status).toBe("live_validation_required");
    expect(readiness.find((item) => item.key === "school_reporting")?.fallback).toContain("Export Hub");
    expect(readiness.find((item) => item.key === "qti_moodle_interop")?.ownerMessage).toContain("conservative Moodle XML");
  });

  it("tracks private exam resources and guide-reviewed curriculum evidence", () => {
    const readiness = getExamsimProductionReadiness({});
    const tools = readiness.find((item) => item.key === "subject_tools");
    const curriculum = readiness.find((item) => item.key === "curriculum_alignment");
    expect(tools?.evidence.routes).toContain("/owner/resources");
    expect(tools?.evidence.migrations).toContain("supabase/migrations/20260622191934_v3_exam_resources_curriculum.sql");
    expect(curriculum?.ownerMessage).toContain("14 private guide-backed draft frameworks");
    expect(curriculum?.evidence.tests).toContain("tests/examsim-v3-curriculum-guide-import.test.ts");
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
    expect(panel).toContain("Release candidate readiness");
    expect(panel).toContain("buildReleaseCandidateReadiness");
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
    expect(page).toContain("Published assessments can export conservative Moodle XML");
    expect(page).toContain("ExportHubDownloads");
    expect(sidebar).toContain('href: "/owner/export-hub"');
  });
});
