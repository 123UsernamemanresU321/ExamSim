import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canAccessOwnerPath,
  filterOwnerNavigationSections,
  requiredPermissionForOwnerPath,
} from "@/lib/examsim/institution-route-access";
import type { InstitutionPermission } from "@/lib/examsim/institution-role-matrix";

describe("Examsim V3 owner route permissions", () => {
  it("maps sensitive owner routes to the least-privilege V3 permission", () => {
    expect(requiredPermissionForOwnerPath("/owner/security")).toBe("readiness_security");
    expect(requiredPermissionForOwnerPath("/owner/export-hub")).toBe("exports");
    expect(requiredPermissionForOwnerPath("/owner/operations")).toBe("invigilation");
    expect(requiredPermissionForOwnerPath("/owner/marking-queue")).toBe("marking");
    expect(requiredPermissionForOwnerPath("/owner/feedback-releases")).toBe("marking");
    expect(requiredPermissionForOwnerPath("/owner/exam-sessions")).toBe("session_publishing");
    expect(requiredPermissionForOwnerPath("/owner/students")).toBe("student_management");
    expect(requiredPermissionForOwnerPath("/owner/analytics")).toBe("analytics");
    expect(requiredPermissionForOwnerPath("/owner/assessments/new")).toBe("assessment_authoring");
    expect(requiredPermissionForOwnerPath("/owner/assessments/assessment-1/cross-mark")).toBe("marking");
    expect(requiredPermissionForOwnerPath("/owner/assessments/assessment-1/approval")).toBe("moderation");
    expect(requiredPermissionForOwnerPath("/owner/exam-sessions/session-1/live")).toBe("invigilation");
    expect(requiredPermissionForOwnerPath("/owner/exam-sessions/session-1/reconcile")).toBe("student_management");
    expect(requiredPermissionForOwnerPath("/owner/marking-queue/moderation")).toBe("moderation");
  });

  it("allows route access only when a collaborator has the required permission", () => {
    const marker: InstitutionPermission[] = ["marking", "student_data"];
    const invigilator: InstitutionPermission[] = ["invigilation", "student_data"];
    const readOnly: InstitutionPermission[] = ["analytics", "student_data"];

    expect(canAccessOwnerPath("/owner/marking-queue", marker)).toBe(true);
    expect(canAccessOwnerPath("/owner/exam-sessions", marker)).toBe(false);
    expect(canAccessOwnerPath("/owner/operations", invigilator)).toBe(true);
    expect(canAccessOwnerPath("/owner/export-hub", invigilator)).toBe(false);
    expect(canAccessOwnerPath("/owner/analytics", readOnly)).toBe(true);
    expect(canAccessOwnerPath("/owner/security", readOnly)).toBe(false);
  });

  it("filters owner navigation sections without leaving empty groups", () => {
    const sections = [
      {
        id: "build",
        title: "Build",
        items: [
          { href: "/owner/assessments", label: "Assessments", requiredPermission: "assessment_authoring" as const },
        ],
      },
      {
        id: "mark",
        title: "Mark",
        items: [
          { href: "/owner/marking-queue", label: "Marking Queue", requiredPermission: "marking" as const },
          { href: "/owner/students", label: "Students", requiredPermission: "student_data" as const },
        ],
      },
    ];

    expect(filterOwnerNavigationSections(sections, ["marking", "student_data"])).toEqual([
      {
        id: "mark",
        title: "Mark",
        items: [
          { href: "/owner/marking-queue", label: "Marking Queue", requiredPermission: "marking" },
          { href: "/owner/students", label: "Students", requiredPermission: "student_data" },
        ],
      },
    ]);
  });

  it("wires role-aware navigation into the owner shell instead of relying on client-only hidden links", () => {
    const sidebar = readFileSync("components/owner/sidebar-nav.tsx", "utf8");
    const shell = readFileSync("components/owner/owner-shell.tsx", "utf8");
    expect(sidebar).toContain("filterOwnerNavigationSections");
    expect(sidebar).toContain("requiredPermission");
    expect(sidebar).toContain("permissions?:");
    expect(shell).toContain("institutionPermissions");
    expect(shell).toContain("<OwnerMobileNav permissions={institutionPermissions}");
  });

  it("enforces workflow permissions in server layouts rather than only hiding navigation", () => {
    const ownerLayout = readFileSync("app/owner/layout.tsx", "utf8");
    expect(ownerLayout).toContain("requireInstitutionContext");
    expect(ownerLayout).not.toContain('requireAppRole("owner"');

    const routeLayouts: Array<[string, InstitutionPermission]> = [
      ["app/owner/marking-queue/layout.tsx", "marking"],
      ["app/owner/operations/layout.tsx", "invigilation"],
      ["app/owner/analytics/layout.tsx", "analytics"],
      ["app/owner/students/layout.tsx", "student_management"],
      ["app/owner/export-hub/layout.tsx", "exports"],
      ["app/owner/security/layout.tsx", "readiness_security"],
    ];
    for (const [file, permission] of routeLayouts) {
      expect(readFileSync(file, "utf8")).toContain(`InstitutionPermissionLayout permission="${permission}"`);
    }
  });

  it("does not let broad parent layouts block or widen nested role-specific workflows", () => {
    const assessmentLayout = readFileSync("app/owner/assessments/layout.tsx", "utf8");
    const sessionLayout = readFileSync("app/owner/exam-sessions/layout.tsx", "utf8");
    expect(assessmentLayout).toContain("InstitutionAnyPermissionLayout");
    expect(assessmentLayout).toContain('"assessment_authoring"');
    expect(assessmentLayout).toContain('"marking"');
    expect(assessmentLayout).toContain('"moderation"');
    expect(sessionLayout).toContain("InstitutionAnyPermissionLayout");
    expect(sessionLayout).toContain('"session_publishing"');
    expect(sessionLayout).toContain('"invigilation"');
    expect(sessionLayout).toContain('"student_management"');

    const nestedLayouts: Array<[string, InstitutionPermission]> = [
      ["app/owner/assessments/[id]/cross-mark/layout.tsx", "marking"],
      ["app/owner/assessments/[id]/approval/layout.tsx", "moderation"],
      ["app/owner/exam-sessions/[id]/live/layout.tsx", "invigilation"],
      ["app/owner/exam-sessions/[id]/reconcile/layout.tsx", "student_management"],
      ["app/owner/exam-sessions/[id]/share/layout.tsx", "session_publishing"],
      ["app/owner/attempts/[id]/mark/layout.tsx", "marking"],
      ["app/owner/marking-queue/moderation/layout.tsx", "moderation"],
    ];
    for (const [file, permission] of nestedLayouts) {
      expect(readFileSync(file, "utf8")).toContain(`InstitutionPermissionLayout permission="${permission}"`);
    }

    for (const file of [
      "app/owner/assessments/page.tsx",
      "app/owner/assessments/new/page.tsx",
      "app/owner/assessments/[id]/page.tsx",
      "app/owner/exam-sessions/page.tsx",
      "app/owner/exam-sessions/[id]/page.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("requireInstitutionPagePermission");
    }
  });

  it("keeps the owner-admin demo context local-only for E2E workflows", () => {
    const roles = readFileSync("lib/examsim/institution-roles.ts", "utf8");
    const runtime = readFileSync("lib/runtime.ts", "utf8");
    expect(roles).toContain("isDemoModeEnabled()");
    expect(roles).toContain('profileId: "demo_owner"');
    expect(roles).toContain('role: "owner_admin"');
    expect(runtime).toContain('process.env.NODE_ENV !== "production"');
  });

  it("guards inline owner mutations with server-side institution permissions", () => {
    const paperGenerator = readFileSync("app/owner/paper-generator/page.tsx", "utf8");
    const questionMetadata = readFileSync("app/owner/question-bank/[questionId]/page.tsx", "utf8");
    const questionImport = readFileSync("app/owner/question-bank/import-from-assessment/page.tsx", "utf8");
    const corrections = readFileSync("app/owner/attempts/[id]/corrections/page.tsx", "utf8");
    expect(paperGenerator).toContain('requireInstitutionPermission("assessment_authoring")');
    expect(paperGenerator).toContain("ownerProfileId");
    expect(questionMetadata).toContain('requireInstitutionPermission("assessment_authoring")');
    expect(questionMetadata).toContain('eq("owner_profile_id", ownerProfileId)');
    expect(questionImport).toContain('requireInstitutionPermission("assessment_authoring")');
    expect(corrections).toContain('requireInstitutionPermission("marking")');
    expect(corrections).toContain("assertInstitutionAttemptAccess");
  });
});
