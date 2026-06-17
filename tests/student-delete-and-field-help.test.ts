import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFieldHelp } from "../lib/form-field-help";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("student deletion and field guidance", () => {
  it("guards student and roster deletion through owner server actions", () => {
    const actions = read("app/owner/students/actions.ts");
    expect(actions).toContain("deleteStudentAccountAction");
    expect(actions).toContain("deleteRosterEntryAction");
    expect(actions).toContain("getSupabaseAdminClient");
    expect(actions).toContain('from("attempts")');
    expect(actions).toContain("auth.admin.deleteUser");
    expect(actions).toContain("audit_owner_action");
    expect(actions).toContain("student.delete_blocked");
    expect(actions).toContain("roster_entry.delete_blocked");
  });

  it("keeps destructive student removal behind a confirmation menu", () => {
    const button = read("components/owner/delete-student-button.tsx");
    const page = read("app/owner/students/page.tsx");
    expect(button).toContain("ConfirmDialog");
    expect(button).toContain("DangerMenu");
    expect(button).toContain("DeleteStudentAccountButton");
    expect(button).toContain("DeleteRosterEntryButton");
    expect(page).toContain("DeleteStudentAccountButton");
    expect(page).toContain("DeleteRosterEntryButton");
    expect(page).toContain("Actions");
  });

  it("adds field-level help to shared inputs and fallback raw controls", () => {
    const form = read("components/ui/form.tsx");
    const runtime = read("components/form-field-help-runtime.tsx");
    const rootLayout = read("app/layout.tsx");
    expect(form).toContain("buildFieldHelp");
    expect(form).toContain("title={title}");
    expect(runtime).toContain("input:not([type='hidden']), textarea, select");
    expect(runtime).toContain("dataset.fieldHelp");
    expect(runtime).toContain("MutationObserver");
    expect(rootLayout).toContain("FormFieldHelpRuntime");
  });

  it("explains common fields with product-specific guidance", () => {
    expect(buildFieldHelp({ name: "student_number" })).toContain("not a password");
    expect(buildFieldHelp({ name: "duration_minutes", type: "number" })).toContain("official end time");
    expect(buildFieldHelp({ name: "source_page_start", type: "number" })).toContain("first PDF page");
    expect(buildFieldHelp({ name: "unknown_total", type: "number", placeholder: "Unknown total" })).toContain("Enter a number");
  });
});
