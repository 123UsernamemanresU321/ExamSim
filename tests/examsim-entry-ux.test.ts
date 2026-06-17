import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("ExamSim entry and authoring UX boundaries", () => {
  it("makes the no-login exam entry route discoverable from the public landing page", () => {
    const source = read("app/page.tsx");
    expect(source).toContain('href: "/exam", label: "Sit an Exam"');
    expect(source).toContain('href: "/login", label: "Teacher / Owner Sign In"');
    expect(source).toContain("Students:");
    expect(source).toContain("student number such as");
    expect(source).toContain("it is not a password");
  });

  it("separates exam code entry from roster identity matching in the student flow", () => {
    expect(read("app/exam/page.tsx")).toContain("Enter Exam Code");
    expect(read("components/exam/exam-code-entry-form.tsx")).toContain("CHEM-P2-047");
    expect(read("components/exam/exam-code-entry-form.tsx")).toContain("student number such as");
    expect(read("app/exam/identity/page.tsx")).toContain("Confirm Your Student Details");
    expect(read("components/exam/guest-identity-form.tsx")).toContain("Matched to student roster");
    expect(read("components/exam/guest-identity-form.tsx")).toContain("not a password");
    expect(read("components/exam/guest-identity-form.tsx")).toContain("confirm_name_mismatch");
    expect(read("components/exam/exam-code-entry-form.tsx")).toContain("examvault_guest_identity_policy");
    expect(read("components/exam/guest-identity-form.tsx")).toContain("readStoredIdentityPolicy");
    expect(read("components/exam/guest-identity-form.tsx")).toContain("required={requireStudentNumber}");
    expect(read("components/exam/guest-exam-workspace.tsx")).toContain("Viewing marked results later");
    expect(read("components/exam/guest-exam-workspace.tsx")).toContain("examvault_guest_submitted_at");
  });

  it("keeps guest exam identity enforcement server-side with roster-match default", () => {
    const edge = read("supabase/functions/join-exam-session/index.ts");
    expect(edge).toContain("readIdentityPolicy(session.identity_policy_json)");
    expect(edge).toContain("requireRosterMatch: policy.require_roster_match !== false");
    expect(edge).toContain("requireStudentName: identityPolicy.requireStudentName");
    expect(edge).toContain("requireStudentNumber: identityPolicy.requireStudentNumber || identityPolicy.requireRosterMatch");
    expect(edge).toContain("allow_unregistered_guests");
    expect(edge).toContain("student_number_not_found");
    expect(edge).toContain("This student number was not found for this exam");
    expect(edge).toContain("student_name_mismatch");
    expect(edge).toContain("identity_review_status");
  });

  it("gives owners explicit student-number management and session identity policy controls", () => {
    expect(read("app/owner/students/page.tsx")).toContain("Student numbers identify students during exam-code entry");
    expect(read("app/owner/students/actions.ts")).toContain("generateRosterEntriesAction");
    expect(read("app/owner/students/actions.ts")).toContain("buildStudentNumber");
    expect(read("components/owner/exam-session-form.tsx")).toContain("Require roster match");
    expect(read("components/owner/exam-session-form.tsx")).toContain("Allow unregistered guest students");
    expect(read("app/owner/exam-sessions/actions.ts")).toContain("require_roster_match");
    expect(read("app/owner/exam-sessions/actions.ts")).toContain("allow_unregistered_guests");
  });

  it("keeps Visual Question Editor teacher-facing across PDF, LaTeX, JSON, and manual workflows", () => {
    const authoring = read("app/owner/assessments/[id]/authoring/page.tsx");
    expect(authoring).toContain("No source document linked yet");
    expect(authoring).toContain("Import PDF");
    expect(authoring).toContain("Import LaTeX");
    expect(authoring).toContain("Advanced JSON Import");
    expect(authoring).toContain("source page fields are hidden");
    expect(authoring).toContain("PDF Region Editor");
    expect(authoring).toContain("LaTeX Compiler");

    const compiler = read("app/owner/assessments/[id]/compiler/page.tsx");
    expect(compiler).toContain("PDF Region Editor");
    expect(compiler).toContain("Use this page for PDF source pages and question boxes");
    expect(compiler).toContain("Open LaTeX Compiler");
    expect(compiler).toContain("Advanced JSON Review");
  });
});
