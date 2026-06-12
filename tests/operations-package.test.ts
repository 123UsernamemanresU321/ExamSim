import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("20-feature operations package", () => {
  it("adds owner operations schema with owner-only RLS", () => {
    const migration = read("supabase/migrations/20260612164408_exam_operations_package.sql");
    for (const table of ["owner_saved_views", "owner_bulk_operations", "marker_assignments"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("owner manages own saved views");
    expect(migration).toContain("owner manages own bulk operations");
    expect(migration).toContain("owner manages own marker assignments");
    expect(migration).toContain("'marking_workspace'");
    expect(migration).not.toContain("student reads");
    expect(migration).not.toContain("student manages");
  });

  it("wires owner operations, support, command palette, and saved views", () => {
    expect(read("components/owner/sidebar-nav.tsx")).toContain("/owner/operations");
    expect(read("components/owner/sidebar-nav.tsx")).toContain("/owner/support");
    expect(read("components/owner/owner-shell.tsx")).toContain("OwnerCommandPalette");
    expect(read("app/owner/assessments/page.tsx")).toContain("SavedViewsToolbar");
    expect(read("app/owner/attempts/[id]/mark/page.tsx")).toContain('scope="marking_workspace"');
    expect(read("app/owner/marking-queue/page.tsx")).toContain("assignMarker");
    expect(read("app/owner/operations/page.tsx")).toContain("runOwnerBulkOperation");
    expect(read("app/owner/support/page.tsx")).toContain("Student Support Console");
  });

  it("adds publish diff, package integrity, and destructive audit previews", () => {
    expect(read("app/owner/assessments/[id]/publish/page.tsx")).toContain("PublishDiffPanel");
    expect(read("components/owner/publish-diff-panel.tsx")).toContain("Package integrity");
    expect(read("app/api/owner/destructive-preview/route.ts")).toContain("getDestructiveActionPreview");
    for (const file of [
      "components/owner/delete-assessment-button.tsx",
      "components/owner/delete-attempt-button.tsx",
      "components/owner/delete-question-bank-item-button.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("Audit preview");
      expect(source).toContain("/api/owner/destructive-preview");
    }
  });

  it("keeps active exam server flow while adding student operations panels", () => {
    const workspace = read("components/exam/exam-workspace.tsx");
    expect(workspace).toContain('"start-attempt-session"');
    expect(workspace).toContain('"get-attempt-state"');
    expect(workspace).toContain('"get-attempt-package"');
    expect(workspace).toContain("ReconnectRecoveryBanner");
    expect(workspace).toContain("UploadQueueDrawer");
    expect(workspace).toContain("ExamWorkspaceControls");
    expect(workspace).toContain("KeyboardShortcutsPanel");
    expect(workspace).toContain("PinnedMaterialsPanel");

    const navigator = read("components/question-navigator.tsx");
    expect(navigator).toContain("unanswered");
    expect(navigator).toContain("flagged");
    expect(navigator).toContain("upload_required");
    expect(navigator).toContain("missing");
  });

  it("persists student flag notes through the checked Edge Function", () => {
    const questionPaper = read("components/question-paper.tsx");
    const edge = read("supabase/functions/set-question-flag/index.ts");
    expect(questionPaper).toContain("flagNote");
    expect(questionPaper).toContain("note:");
    expect(edge).toContain("note?: string");
    expect(edge).toContain("slice(0, 500)");
    expect(edge).toContain("has_note");
    expect(edge).toContain('if (state !== "ACTIVE")');
  });

  it("keeps homepage auth-aware and fixes dark sidebar contrast", () => {
    const home = read("app/page.tsx");
    const globals = read("app/globals.css");
    const studentSidebar = read("components/student/student-sidebar-nav.tsx");
    expect(home).toContain("Go to Owner Dashboard");
    expect(home).toContain("Go to Student Command Center");
    expect(home).toContain("Operational gateway");
    expect(globals).toContain("--sidebar-muted: #c1c9d8");
    expect(studentSidebar).toContain("text-[var(--sidebar-muted)]");
  });
});
