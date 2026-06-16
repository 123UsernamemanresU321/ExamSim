import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Examsim limitation fixes", () => {
  it("mutates attempt timing for valid live extra-time interventions", () => {
    const source = read("app/owner/exam-sessions/[id]/live/actions.ts");
    expect(source).toContain("validateExtraTimeSeconds");
    expect(source).toContain("computeAttemptState");
    expect(source).toContain("FINISHED_REVIEW");
    expect(source).toContain("end_at_utc");
    expect(source).toContain("upload_deadline_at_utc");
    expect(source).toContain("audit_owner_action");
    expect(source).toContain("extra_seconds");
    expect(source).toContain("Extra time must be between");
  });

  it("adds guest upload signing, confirmation, and finalization-required upload checks", () => {
    expect(read("supabase/functions/guest-issue-upload-slot-url/index.ts")).toContain("createSignedUploadUrl");
    expect(read("supabase/functions/guest-issue-upload-slot-url/index.ts")).toContain("verifyGuestAttemptToken");
    expect(read("supabase/functions/guest-issue-upload-slot-url/index.ts")).toContain("answer-uploads");
    expect(read("supabase/functions/guest-confirm-upload-slot/index.ts")).toContain("verifyAnswerUploadPdf");
    expect(read("supabase/functions/guest-confirm-upload-slot/index.ts")).toContain("locked_at");
    expect(read("supabase/functions/guest-finalize-attempt/index.ts")).toContain("missing_required_uploads");
    expect(read("components/exam/guest-exam-workspace.tsx")).toContain("guest-issue-upload-slot-url");
    expect(read("components/exam/guest-exam-workspace.tsx")).toContain("guest-confirm-upload-slot");
    expect(read("components/exam/guest-exam-workspace.tsx")).toContain("file-too-large");
    expect(read("components/exam/guest-exam-workspace.tsx")).toContain("Missing required uploads");
  });

  it("keeps guest SEB package release blocked with explicit teacher-facing fallback wording", () => {
    const edge = read("supabase/functions/guest-get-attempt-package/index.ts");
    const ui = read("components/exam/guest-exam-workspace.tsx");
    expect(edge).toContain("verified secure mode is configured");
    expect(edge).toContain("seb_required");
    expect(ui).toContain("Guest SEB sessions are blocked");
    expect(ui).not.toContain("seb_verified: true");
  });

  it("connects compiler routes to existing parser/provider paths with honest fallback states", () => {
    const compiler = read("app/owner/assessments/[id]/compiler/page.tsx");
    const latex = read("app/owner/assessments/[id]/latex/page.tsx");
    const actions = read("app/owner/assessments/[id]/authoring/actions.ts");
    expect(compiler).toContain("MineruHostedPanel");
    expect(compiler).toContain("ai-parse-assessment");
    expect(compiler).toContain("missing provider");
    expect(compiler).toContain("low confidence");
    expect(latex).toContain("ingest-assessment");
    expect(actions).toContain("createLatexDraftAction");
    expect(actions).toContain("parse_jobs");
  });
});
