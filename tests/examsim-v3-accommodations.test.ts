import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Examsim V3 accommodations matrix", () => {
  it("provides an audited owner control for every supported roster policy", () => {
    const component = readFileSync("components/owner/roster-accommodations-control.tsx", "utf8");
    const actions = readFileSync("app/owner/students/actions.ts", "utf8");
    expect(component).toContain("RosterAccommodationsControl");
    for (const key of [
      "extra_time_percent",
      "upload_extension_minutes",
      "rest_break_allowed",
      "rest_break_max_minutes",
      "font_scale_percent",
      "dyslexia_font",
      "contrast_mode",
      "calculator_policy",
      "formula_booklet_allowed",
      "allowed_materials",
    ]) {
      expect(component).toContain(key);
      expect(actions).toContain(key);
    }
    expect(actions).toContain("updateRosterAccommodationsAction");
    expect(actions).toContain("roster_entry.accommodations_updated");
    expect(actions).toContain('requireInstitutionPermission("student_management"');
  });

  it("shows the accommodations control in the roster without exposing raw JSON", () => {
    const page = readFileSync("app/owner/students/page.tsx", "utf8");
    expect(page).toContain("RosterAccommodationsControl");
    expect(page).toContain('"Accommodations"');
    expect(page).not.toContain("JSON.stringify(entry.accommodations_json");
  });

  it("returns verified display and tool policies from authenticated and guest state endpoints", () => {
    const guest = readFileSync("supabase/functions/guest-get-attempt-state/index.ts", "utf8");
    const authenticated = readFileSync("supabase/functions/get-attempt-state/index.ts", "utf8");
    expect(guest).toContain("loadAttemptAccommodationPolicy");
    expect(guest).toContain("accommodation_policy");
    expect(authenticated).toContain("loadAttemptAccommodationPolicy");
    expect(authenticated).toContain("accommodation_policy");
  });

  it("applies verified display policy and explains allowed tools in both exam workspaces", () => {
    const guest = readFileSync("components/exam/guest-exam-workspace.tsx", "utf8");
    const authenticated = readFileSync("components/exam/exam-workspace.tsx", "utf8");
    const summary = readFileSync("components/exam/accommodation-summary.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");
    for (const workspace of [guest, authenticated]) {
      expect(workspace).toContain("AccommodationSummary");
      expect(workspace).toContain("data-exam-font-scale");
      expect(workspace).toContain("data-exam-contrast");
    }
    expect(summary).toContain("Calculator");
    expect(summary).toContain("Formula booklet");
    expect(summary).toContain("Approved materials");
    expect(css).toContain('[data-exam-font-scale="125"]');
    expect(css).toContain('[data-exam-contrast="high"]');
  });
});
