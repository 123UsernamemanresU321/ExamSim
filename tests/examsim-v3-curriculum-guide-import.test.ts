import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Examsim V3 curriculum guide imports", () => {
  it("uses checked private PDF upload boundaries for licensed guides", () => {
    const issue = read("supabase/functions/owner-issue-curriculum-source-upload/index.ts");
    const confirm = read("supabase/functions/owner-confirm-curriculum-source-upload/index.ts");
    expect(issue).toContain('requireInstitutionAal2(request, "assessment_authoring")');
    expect(issue).toContain('from("curriculum-sources").createSignedUploadUrl');
    expect(confirm).toContain("verifyPrivatePdfUpload");
    expect(confirm).toContain("sha256");
    expect(confirm).toContain("curriculum_source_documents");
    expect(confirm).toContain("curriculum_import_jobs");
  });

  it("provides a visual review queue with approve and reject actions", () => {
    const page = read("app/owner/standards/page.tsx");
    const actions = read("app/owner/standards/actions.ts");
    const panel = read("components/owner/curriculum-guide-review-panel.tsx");
    expect(page).toContain("CurriculumGuideReviewPanel");
    expect(panel).toContain("Source pages");
    expect(panel).toContain("Approve selected");
    expect(panel).toContain("Reject selected");
    expect(actions).toContain('rpc("institution_review_curriculum_standards"');
    expect(actions).toContain("curriculum_standard.reviewed");
  });

  it("renders an intentional empty review surface in local demo mode", () => {
    const page = read("app/owner/standards/page.tsx");
    expect(page).toContain("isDemoModeEnabled");
    expect(page).toContain("if (!demoMode)");
  });

  it("keeps draft nodes out of authoring, generation, analytics, and revision", () => {
    for (const path of [
      "app/owner/paper-generator/page.tsx",
      "app/owner/question-bank/page.tsx",
      "app/owner/question-bank/[questionId]/page.tsx",
      "app/owner/analytics/page.tsx",
      "app/owner/revision/actions.ts",
      "lib/examsim/cohort-analytics-data.ts",
    ]) {
      expect(read(path)).toContain('review_status", "approved"');
    }
  });

  it("labels imported frameworks as school-reviewed and guide-version specific", () => {
    const page = read("app/owner/standards/page.tsx");
    expect(page).toContain("school-reviewed");
    expect(page).toContain("guide-version-specific");
    expect(page).toContain("illustrative sample frameworks");
  });
});
