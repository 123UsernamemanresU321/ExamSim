import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INSTITUTION_PERMISSION_KEYS,
  INSTITUTION_ROLE_KEYS,
  permissionsForInstitutionRole,
  roleHasInstitutionPermission,
} from "@/lib/examsim/institution-role-matrix";

function readInstitutionRoleMigration() {
  const migrationsDir = "supabase/migrations";
  const migration = readdirSync(migrationsDir)
    .map((file) => ({ file, source: readFileSync(join(migrationsDir, file), "utf8") }))
    .find((entry) => entry.source.includes("institution_memberships"));
  if (!migration) throw new Error("institution_memberships migration not found");
  return migration.source;
}

describe("Examsim V3 institution role matrix", () => {
  it("defines the V3 roles with least-privilege permissions", () => {
    expect(INSTITUTION_ROLE_KEYS).toEqual([
      "owner_admin",
      "teacher",
      "marker",
      "reviewer",
      "invigilator",
      "read_only",
    ]);
    expect(INSTITUTION_PERMISSION_KEYS).toContain("assessment_authoring");
    expect(INSTITUTION_PERMISSION_KEYS).toContain("readiness_security");

    expect(roleHasInstitutionPermission("owner_admin", "readiness_security")).toBe(true);
    expect(roleHasInstitutionPermission("teacher", "session_publishing")).toBe(true);
    expect(roleHasInstitutionPermission("marker", "marking")).toBe(true);
    expect(roleHasInstitutionPermission("marker", "session_publishing")).toBe(false);
    expect(roleHasInstitutionPermission("reviewer", "moderation")).toBe(true);
    expect(roleHasInstitutionPermission("reviewer", "assessment_authoring")).toBe(false);
    expect(roleHasInstitutionPermission("invigilator", "invigilation")).toBe(true);
    expect(roleHasInstitutionPermission("invigilator", "exports")).toBe(false);
    expect(roleHasInstitutionPermission("read_only", "student_data")).toBe(true);
    expect(roleHasInstitutionPermission("read_only", "marking")).toBe(false);
  });

  it("returns defensive permission copies so callers cannot mutate the matrix", () => {
    const teacherPermissions = permissionsForInstitutionRole("teacher") as string[];
    teacherPermissions.push("readiness_security");
    expect(roleHasInstitutionPermission("teacher", "readiness_security")).toBe(false);
  });

  it("adds owner-scoped RLS and no anonymous access for institution memberships", () => {
    const migration = readInstitutionRoleMigration();
    expect(migration).toContain("create table if not exists public.institution_memberships");
    expect(migration).toContain("alter table public.institution_memberships enable row level security");
    expect(migration).toContain("institution_memberships_owner_manage");
    expect(migration).toContain("institution_memberships_member_read");
    expect(migration).toContain("institution_memberships_one_active_role_idx");
    expect(migration).toContain("where status = 'active'");
    expect(migration).not.toMatch(/to\s+anon/i);
  });

  it("surfaces the role matrix in the owner security readiness page", () => {
    const page = readFileSync("app/owner/security/page.tsx", "utf8");
    const panel = readFileSync("components/owner/institution-role-matrix-panel.tsx", "utf8");
    const readiness = readFileSync("lib/examsim-production-readiness.ts", "utf8");
    expect(page).toContain("InstitutionRoleMatrixPanel");
    expect(panel).toContain("Institution role matrix");
    expect(panel).toContain("roleHasInstitutionPermission");
    expect(readiness).toContain('"institution_role_matrix"');
  });

  it("requires server-side institution permissions on sensitive owner actions", () => {
    const sessionActions = readFileSync("app/owner/exam-sessions/actions.ts", "utf8");
    const operationActions = readFileSync("app/owner/operations-actions.ts", "utf8");
    expect(sessionActions).toContain('requireInstitutionPermission("session_publishing"');
    expect(operationActions).toContain('requireInstitutionPermission("marking"');
    expect(operationActions).toContain("permissionForBulkOperation");
    expect(operationActions).toContain('operationType === "export_receipts"');
    expect(operationActions).toContain('return "exports"');
    expect(operationActions).toContain('operationType === "release_feedback" || operationType === "assign_marker"');
    expect(operationActions).toContain('return "invigilation"');
  });
});
