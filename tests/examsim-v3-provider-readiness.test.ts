import { describe, expect, it } from "vitest";
import {
  getImportJobState,
  getProviderReadiness,
  summarizeImportJobs,
  V3_PROVIDER_CAPABILITY_KEYS,
} from "@/lib/examsim/provider-readiness";

const baseJob = {
  id: "job-1",
  parser: "mineru_hosted",
  status: "queued",
  requested_ocr: true,
  external_state: null,
  metadata_json: {},
  error_message: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("Examsim V3 provider and import readiness", () => {
  it("reports all V3 provider capabilities without pretending missing providers are configured", () => {
    const readiness = getProviderReadiness({});
    expect(readiness.map((item) => item.key)).toEqual(V3_PROVIDER_CAPABILITY_KEYS);

    expect(readiness.find((item) => item.key === "ocr_layout")?.status).toBe("provider_required");
    expect(readiness.find((item) => item.key === "ai_semantic")?.status).toBe("manual_fallback");
    expect(readiness.find((item) => item.key === "storage_private_files")?.requiredEnvVars).toContain("NEXT_PUBLIC_SUPABASE_URL");

    for (const item of readiness) {
      expect(item.ownerMessage.length).toBeGreaterThan(24);
      expect(item.safeProbe.length).toBeGreaterThan(8);
    }
  });

  it("promotes configured provider capabilities only from server-side env checks", () => {
    const readiness = getProviderReadiness({
      DEEPSEEK_API_KEY: "set",
      MINERU_API_KEY: "set",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });

    expect(readiness.find((item) => item.key === "ocr_layout")?.status).toBe("ready");
    expect(readiness.find((item) => item.key === "ai_semantic")?.status).toBe("ready");
    expect(readiness.find((item) => item.key === "storage_private_files")?.status).toBe("ready");
  });

  it("normalizes existing parse job states into the V3 import job language", () => {
    const env = { MINERU_API_KEY: "set" };
    expect(getImportJobState({ ...baseJob, status: "queued" }, env)).toBe("queued");
    expect(getImportJobState({ ...baseJob, status: "running" }, env)).toBe("processing");
    expect(getImportJobState({ ...baseJob, status: "failed" }, env)).toBe("failed");
    expect(getImportJobState({ ...baseJob, status: "review_required" }, env)).toBe("needs_review");
    expect(getImportJobState({ ...baseJob, status: "succeeded" }, env)).toBe("completed");
    expect(getImportJobState({ ...baseJob, status: "review_required", metadata_json: { confidence: 0.41 } }, env)).toBe("low_confidence");
    expect(getImportJobState({ ...baseJob, status: "queued", metadata_json: { retry_count: 1 } }, env)).toBe("retried");
  });

  it("uses not_configured when a provider-backed job cannot run with the available env", () => {
    expect(getImportJobState({ ...baseJob, parser: "mineru_hosted", status: "queued" }, {})).toBe("not_configured");
    expect(getImportJobState({ ...baseJob, parser: "deepseek_ai", status: "queued" }, { MINERU_API_KEY: "set" })).toBe("not_configured");
  });

  it("summarizes import jobs for the owner-facing readiness dashboard", () => {
    const summary = summarizeImportJobs([
      { ...baseJob, id: "queued", status: "queued" },
      { ...baseJob, id: "failed", status: "failed" },
      { ...baseJob, id: "review", status: "review_required", metadata_json: { confidence: 0.35 } },
      { ...baseJob, id: "done", status: "succeeded" },
    ], { MINERU_API_KEY: "set" });

    expect(summary.total).toBe(4);
    expect(summary.byState.queued).toBe(1);
    expect(summary.byState.failed).toBe(1);
    expect(summary.byState.low_confidence).toBe(1);
    expect(summary.byState.completed).toBe(1);
    expect(summary.actionRequired).toBe(2);
  });
});
