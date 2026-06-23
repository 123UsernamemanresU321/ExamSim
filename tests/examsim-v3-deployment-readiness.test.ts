import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDeploymentReadinessChecklist,
  summarizeDeploymentReadiness,
} from "@/lib/examsim/deployment-readiness";

describe("Examsim V3 deployment readiness", () => {
  it("covers deployment gates required before high-stakes V3 launch", () => {
    const checklist = buildDeploymentReadinessChecklist({});
    expect(checklist.map((item) => item.key)).toEqual([
      "env_core",
      "supabase_migrations",
      "rls_policies",
      "private_storage",
      "edge_functions",
      "provider_status",
      "seed_accounts",
      "security_claims",
    ]);
    expect(checklist.find((item) => item.key === "env_core")?.status).toBe("blocked");
    expect(checklist.find((item) => item.key === "supabase_migrations")?.status).toBe("manual_validation");
  });

  it("marks core env as ready only when required production vars are present", () => {
    const checklist = buildDeploymentReadinessChecklist({
      APP_ALLOWED_ORIGINS: "https://exam.example",
      ATTEMPT_STATE_TOKEN_SECRET: "secret",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    expect(checklist.find((item) => item.key === "env_core")?.status).toBe("ready");
  });

  it("recognizes SimpleTeX as the configured OCR provider", () => {
    const checklist = buildDeploymentReadinessChecklist({
      SIMPLETEX_APP_ID: "app-id",
      SIMPLETEX_APP_SECRET: "app-secret",
    });
    const provider = checklist.find((item) => item.key === "provider_status");
    expect(provider?.status).toBe("manual_validation");
    expect(provider?.requiredEnvVars.join(" ")).toContain("SIMPLETEX_APP_ID");
  });

  it("summarizes blocked and manual validation items for the owner console", () => {
    const summary = summarizeDeploymentReadiness(buildDeploymentReadinessChecklist({}));
    expect(summary.total).toBe(8);
    expect(summary.blocked).toBeGreaterThan(0);
    expect(summary.manualValidation).toBeGreaterThan(0);
  });

  it("includes the private exam resource and curriculum source buckets", () => {
    const storage = buildDeploymentReadinessChecklist({}).find((item) => item.key === "private_storage");
    expect(storage?.nextAction).toContain("assessment-resources");
    expect(storage?.nextAction).toContain("curriculum-sources");
  });

  it("surfaces the deployment readiness console on the owner security page", () => {
    const page = readFileSync("app/owner/security/page.tsx", "utf8");
    const component = readFileSync("components/owner/deployment-readiness-console.tsx", "utf8");
    expect(page).toContain("DeploymentReadinessConsole");
    expect(component).toContain("Deployment readiness console");
    expect(component).toContain("manual validation");
  });
});
