import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("student-side schema and visibility boundaries", () => {
  it("adds student-side tables with row level security", () => {
    const migration = readFileSync("supabase/migrations/202605230001_student_side_usability.sql", "utf8");
    for (const table of [
      "student_device_checks",
      "student_devices",
      "student_notification_preferences",
      "student_notifications",
      "assessment_materials",
      "student_accessibility_preferences",
      "student_performance_preferences",
      "upload_queue_events",
      "student_incident_reports",
      "student_recovery_codes",
      "student_feedback_reads",
      "student_confidence_ratings",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps student policies scoped to own profile or released attempt data", () => {
    const migration = readFileSync("supabase/migrations/202605230001_student_side_usability.sql", "utf8");
    expect(migration).toContain("public.current_profile_id()");
    expect(migration).toContain("a.assignee_profile_id = public.current_profile_id()");
    expect(migration).toContain("fr.visible_to_student = true");
    expect(migration).not.toContain("public.is_student()");
  });

  it("does not add broad student reads for protected assessment content", () => {
    const migration = readFileSync("supabase/migrations/202605230001_student_side_usability.sql", "utf8");
    expect(migration).not.toContain("on public.assessment_versions for select");
    expect(migration).not.toContain("on public.question_nodes for select");
  });

  it("keeps feedback read receipts independent of direct feedback release table access", () => {
    const migration = readFileSync("supabase/migrations/202605250001_fix_feedback_read_receipts_rls.sql", "utf8");
    expect(migration).toContain('drop policy if exists "students manage own feedback reads"');
    expect(migration).toContain("on public.student_feedback_reads for all to authenticated");
    expect(migration).toContain("a.assignee_profile_id = public.current_profile_id()");
    expect(migration).not.toContain("join public.feedback_releases");
    expect(migration).not.toContain("fr.visible_to_student");
  });
});
