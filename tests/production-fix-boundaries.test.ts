import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("production deployment boundary", () => {
  it("does not ship the removed GitHub Pages static export path", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(packageJson.scripts).not.toHaveProperty("build:pages");
    expect(existsSync(".github/workflows/deploy-pages.yml")).toBe(false);
    expect(existsSync("scripts/prepare-github-pages.mjs")).toBe(false);
    expect(read("next.config.ts")).not.toMatch(/output:\s*["']export["']/);
    expect(read("proxy.ts")).toContain("createServerClient");
  });

  it("keeps demo mode local-only", () => {
    expect(read("lib/runtime.ts")).toContain('process.env.NODE_ENV !== "production"');
    expect(read("README.md")).toContain("Vercel SSR is the required production host");
    expect(read("SECURITY.md")).toContain("Static export hosting is not supported");
  });
});

describe("RLS and storage hardening migration", () => {
  it("drops direct student content and result policies", () => {
    const migration = read("supabase/migrations/202605120001_harden_content_release_boundaries.sql");
    expect(migration).toContain('drop policy if exists "student reads assigned assessment package"');
    expect(migration).toContain('drop policy if exists "student manages own answer uploads"');
    expect(migration).toContain('drop policy if exists "student reads released question nodes"');
    expect(migration).toContain('drop policy if exists "student reads released assessment versions"');
    expect(migration).toContain('drop policy if exists "student reads released marks"');
    expect(migration).toContain('drop policy if exists "student reads released feedback annotations"');
    expect(migration).toContain('drop policy if exists "student reads own released feedback"');
  });

  it("does not leave the old student result policy migration active", () => {
    const migration = read("supabase/migrations/202605090001_student_results_rls.sql");
    expect(migration).not.toContain("create policy");
    expect(migration).toContain("Student-visible results are now served through Edge Functions");
  });
});

describe("Edge state and content release boundaries", () => {
  it("binds state tokens to attempt sessions when provided", () => {
    const source = read("supabase/functions/get-attempt-state/index.ts");
    expect(source).toContain("attempt_session_id?: string");
    expect(source).toContain(".from(\"attempt_sessions\")");
    expect(source).toContain("attempt_session_id: attemptSessionId");
  });

  it("denies package release while waiting and returns server-issued asset urls when released", () => {
    const source = read("supabase/functions/get-attempt-package/index.ts");
    expect(source).toContain('state === "WAITING"');
    expect(source).toContain("Content not available yet");
    expect(source).toContain("asset_urls: assetUrls");
    expect(source).toContain('admin.storage.from("assessment-packages").createSignedUrl');
  });

  it("uses shared structured Edge error responses for formerly inconsistent functions", () => {
    for (const path of [
      "supabase/functions/publish-assessment/index.ts",
      "supabase/functions/export-marks-csv/index.ts",
      "supabase/functions/mineru-submit-hosted-job/index.ts",
      "supabase/functions/mineru-poll-hosted-job/index.ts",
      "supabase/functions/seb-handshake/index.ts",
    ]) {
      expect(read(path), path).toContain("errorResponse");
    }
    expect(read("supabase/functions/_shared/http.ts")).toContain("invalid jwt");
  });
});

describe("client sensitive write cleanup", () => {
  it("routes typed responses and flags through Edge Functions", () => {
    expect(read("components/response-text-area.tsx")).toContain('"save-text-response"');
    expect(read("components/response-text-area.tsx")).not.toContain('from("text_responses")');
    expect(read("components/question-paper.tsx")).toContain('"set-question-flag"');
    expect(read("components/question-paper.tsx")).not.toContain('from("submission_annotations")');
  });

  it("routes owner private object viewing through owner-only signed URL Edge Function", () => {
    expect(read("components/owner/parse-review-client.tsx")).toContain('"owner-sign-storage-url"');
    expect(read("components/owner/marking-response-workspace.tsx")).toContain('"owner-sign-storage-url"');
    expect(read("components/owner/marking-workspace-form.tsx")).toContain('"owner-sign-storage-url"');
  });

  it("serves student results through the checked Edge Function only", () => {
    expect(read("app/student/attempts/[id]/results/page.tsx")).toContain("getStudentAttemptResultsWorkspace");
    expect(read("app/student/results/client.tsx")).toContain('"list-student-results"');
    expect(read("app/student/results/client.tsx")).not.toContain('from("feedback_releases")');
    expect(existsSync("components/student/student-results-client.tsx")).toBe(false);
    expect(read("lib/live-data.ts")).toContain('"get-student-results"');
  });
});
