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
    expect(requiredPermissionForOwnerPath("/owner/students")).toBe("student_data");
    expect(requiredPermissionForOwnerPath("/owner/analytics")).toBe("analytics");
    expect(requiredPermissionForOwnerPath("/owner/assessments/new")).toBe("assessment_authoring");
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
});
