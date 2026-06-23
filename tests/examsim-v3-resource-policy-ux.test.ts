import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Examsim V3 resource policy UX", () => {
  it("provides a reusable private resource library in owner navigation", () => {
    const resourcesPage = read("app/owner/resources/page.tsx");
    expect(resourcesPage).toContain("Resource Library");
    expect(resourcesPage).toContain("isDemoModeEnabled");
    expect(read("components/owner/resource-library-manager.tsx")).toContain("owner-issue-resource-upload");
    expect(read("components/owner/resource-library-manager.tsx")).toContain("owner-confirm-resource-upload");
    expect(read("components/owner/sidebar-nav.tsx")).toContain('/owner/resources');
    const actions = read("app/owner/resources/actions.ts");
    expect(actions).toContain('.select("id")');
    expect(actions).toContain("Resource archive did not update the expected workspace row");
  });

  it("provides version-scoped assessment material and tool settings", () => {
    const page = read("app/owner/assessments/[id]/settings/page.tsx");
    const actions = read("app/owner/assessments/[id]/settings/actions.ts");
    expect(page).toContain("Materials and tools");
    expect(page).toContain("Physical GDC");
    expect(page).toContain("Required");
    expect(page).toContain("Not permitted");
    expect(actions).toContain("assessment_tool_policies");
    expect(actions).toContain("assessment_materials");
    expect(actions).toContain("published");
  });

  it("uses checked signed resource boundaries instead of direct student reads", () => {
    const studentData = read("lib/student-experience.ts");
    expect(studentData).toContain('invokeEdgeFunctionServer<AttemptResourcesResponse>("get-attempt-resources"');
    expect(studentData).not.toContain('safeStudentRows<AssessmentMaterial>("assessment_materials"');
    expect(studentData).not.toContain('.storage.from("assessment-sources").createSignedUrl(material.object_path');
  });

  it("shows required, allowed, and prohibited policy in both exam experiences", () => {
    const authenticated = read("components/exam/exam-workspace.tsx");
    const guest = read("components/exam/guest-exam-workspace.tsx");
    const summary = read("components/exam/exam-policy-summary.tsx");
    expect(authenticated).toContain("<ExamPolicySummary");
    expect(guest).toContain("<ExamPolicySummary");
    expect(summary).toContain("Required");
    expect(summary).toContain("Allowed");
    expect(summary).toContain("Not permitted");
    expect(summary).toContain("Prepare an approved physical GDC");
  });
});
