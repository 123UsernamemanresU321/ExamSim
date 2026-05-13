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
      "supabase/functions/seb-verify-session/index.ts",
      "supabase/functions/upload-seb-config/index.ts",
    ]) {
      expect(read(path), path).toContain("errorResponse");
    }
    expect(read("supabase/functions/_shared/http.ts")).toContain("invalid jwt");
  });

  it("implements SEB release as server-side request-hash verification", () => {
    const shared = read("supabase/functions/_shared/seb.ts");
    expect(shared).toContain("x-safeexambrowser-requesthash");
    expect(shared).toContain("x-safeexambrowser-configkeyhash");
    expect(shared).toContain("canonicalizeSebUrl");
    expect(shared).toContain("verifySebRequestHashes");
    expect(shared).toContain("APP_ALLOWED_ORIGINS");

    const packageGate = read("supabase/functions/get-attempt-package/index.ts");
    expect(packageGate).toContain("SEB attempts require a session-bound state token");
    expect(packageGate).toContain("sebVerificationTtlSeconds");
    expect(packageGate).not.toContain("seb_browser_exam_key_hash?:");
    expect(packageGate).not.toContain("seb_config_key_hash?:");

    const sessionVerifier = read("supabase/functions/seb-verify-session/index.ts");
    expect(sessionVerifier).toContain("mode?: \"header\" | \"js_api\"");
    expect(sessionVerifier).toContain("validateSebPageUrl");
    expect(sessionVerifier).toContain("verifyStateToken");
    expect(sessionVerifier).toContain("seb_verified_at");
  });

  it("does not use user-agent or body-forged SEB keys in the active exam client", () => {
    const source = read("components/exam/exam-workspace.tsx");
    expect(source).toContain('"seb-verify-session"');
    expect(source).toContain('"get-attempt-package"');
    expect(source).not.toContain("navigator.userAgent");
    expect(source).not.toContain("seb_browser_exam_key_hash:");
    expect(source).not.toContain("seb_config_key_hash:");
  });

  it("routes owner SEB config upload through an AAL2-gated Edge Function", () => {
    const form = read("components/owner/publish-assessment-form.tsx");
    expect(form).toContain('"upload-seb-config"');
    expect(form).not.toContain('.storage\n        .from("assessment-sources")');
    expect(form).toContain("requiresAal2: true");
    expect(read("supabase/functions/upload-seb-config/index.ts")).toContain("requireOwnerAal2");
  });
});

describe("AI parse review boundary", () => {
  it("does not reject PDF/MinerU suggestions solely because a latex prompt is short", () => {
    const source = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(source).not.toContain("latex prompt suspiciously short");
    expect(source).toContain("prompt is short; owner should verify PDF/OCR extraction.");
    expect(source).toContain("warnings.push");
  });

  it("instructs DeepSeek to emit semantic tables and delimited math", () => {
    const source = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(source).toContain("<table>, <thead>, <tbody>, <tr>, <th>, <td>");
    expect(source).toContain("Use semantic HTML tables for tabular or grid content");
    expect(source).toContain("Do not flatten tables into tabs or spaces");
    expect(source).toContain("wrap all mathematical expressions in $...$ or $$...$$");
  });

  it("instructs DeepSeek to use numerical response mode for numeric answers", () => {
    const source = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(source).toContain('Use response_mode \\"numerical\\"');
    expect(source).toContain("expected answer is a number, value, numerator, count, measurement, coordinate, or decimal");
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

  it("hydrates released package nodes with database UUIDs before student writes", () => {
    const source = read("supabase/functions/get-attempt-package/index.ts");
    expect(source).toContain("hydratePackageQuestionNodeIds");
    expect(source).toContain(".from(\"question_nodes\")");
    expect(source).toContain("node_key");
    expect(source).toContain("assessmentPackageWithDatabaseIds");
  });

  it("resolves student write question nodes by uuid or node key without direct table writes", () => {
    const saveSource = read("supabase/functions/save-text-response/index.ts");
    expect(saveSource).toContain("question_node_key?: string");
    expect(saveSource).toContain("resolveQuestionNodeForAttempt");
    expect(saveSource).toContain("isUuid");

    const flagSource = read("supabase/functions/set-question-flag/index.ts");
    expect(flagSource).toContain("question_node_key?: string");
    expect(flagSource).toContain("resolveQuestionNodeForAttempt");

    const questionPaper = read("components/question-paper.tsx");
    expect(questionPaper).toContain("question_node_key: node.node_key");
    expect(questionPaper).toContain("questionNodeKey={node.node_key}");
  });

  it("serves student results through the checked Edge Function only", () => {
    expect(read("app/student/attempts/[id]/results/page.tsx")).toContain("getStudentAttemptResultsWorkspace");
    expect(read("app/student/results/client.tsx")).toContain('"list-student-results"');
    expect(read("app/student/results/client.tsx")).not.toContain('from("feedback_releases")');
    expect(existsSync("components/student/student-results-client.tsx")).toBe(false);
    expect(read("lib/live-data.ts")).toContain('"get-student-results"');
  });
});

describe("student response type controls", () => {
  it("renders structured response controls through Edge-saved text responses", () => {
    const questionPaper = read("components/question-paper.tsx");
    expect(questionPaper).toContain("ChoiceResponseControl");
    expect(questionPaper).toContain("NumericalResponseControl");

    const structuredControl = read("components/structured-response-control.tsx");
    expect(structuredControl).toContain("type=\"checkbox\"");
    expect(structuredControl).toContain("type=\"radio\"");
    expect(structuredControl).toContain("inputMode=\"decimal\"");
    expect(structuredControl).toContain('"save-text-response"');
    expect(structuredControl).not.toContain('from("text_responses")');
  });

  it("updates database and parser response mode allowlists for numerical responses", () => {
    expect(read("lib/constants.ts")).toContain('"numerical"');
    expect(read("supabase/functions/update-question-tree/index.ts")).toContain('"numerical"');
    expect(read("supabase/functions/ai-parse-assessment/index.ts")).toContain('"numerical"');
    expect(read("supabase/migrations/202605130002_add_numerical_response_mode.sql")).toContain("'numerical'");
  });
});

describe("prompt rendering and AAL2 stability", () => {
  it("does not wrap whole prose prompts in display math in the marking workspace", () => {
    const source = read("components/owner/marking-center-panel.tsx");
    expect(source).not.toContain("$$${node.prompt_latex}$$");
    expect(source).toContain("latex={node.prompt_latex}");
  });

  it("does not rotate the Supabase session while only checking current AAL2", () => {
    const source = read("lib/supabase/functions-client.ts");
    const helper = source.slice(source.indexOf("export async function assertOwnerAal2"));
    expect(helper).not.toContain("refreshSession");
    expect(helper).toContain("getAuthenticatorAssuranceLevel");
  });

  it("does not rely on post-render DOM mutation for KaTeX prompts", () => {
    const source = read("components/math-renderer.tsx");
    expect(source).toContain("renderMathMarkup");
    expect(source).not.toContain("renderMathInElement");
  });
});
