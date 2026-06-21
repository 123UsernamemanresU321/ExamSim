import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function securityClosureMigration() {
  const name = readdirSync(join(root, "supabase/migrations")).find((entry) => entry.endsWith("_v3_security_closure.sql"));
  expect(name, "security closure migration").toBeTruthy();
  return read(`supabase/migrations/${name}`);
}

describe("V3 security closure", () => {
  it("binds revision items, assignments, and student-safe reads to one institution", () => {
    const migration = securityClosureMigration();
    expect(migration).toContain("question_bank_items bank");
    expect(migration).toContain("bank.owner_profile_id = revision.owner_profile_id");
    expect(migration).toMatch(/(?:assignment\.student_profile_id = revision\.student_profile_id|revision\.student_profile_id = assignment\.student_profile_id)/);
    expect(migration).toContain("institution_manages_student");
    expect(migration).toContain("set search_path = ''");
  });

  it("keeps authenticated attempt state and package release student-owned", () => {
    for (const path of [
      "supabase/functions/get-attempt-state/index.ts",
      "supabase/functions/get-attempt-package/index.ts",
      "supabase/functions/record-attempt-event/index.ts",
      "supabase/functions/analyze-upload/index.ts",
      "supabase/functions/create-submission-receipt/index.ts",
      "supabase/functions/get-student-results/index.ts",
    ]) {
      const source = read(path);
      expect(source, path).toMatch(/attempt\??\.assignee_profile_id !== profile\.id/);
      expect(source, path).not.toContain('profile.app_role !== "owner" &&');
      expect(source, path).not.toContain('const isOwner = profile.app_role === "owner"');
    }
  });

  it("uses a bounded atomic RPC for attempt accommodations", () => {
    const source = read("supabase/functions/attempt-intervention/index.ts");
    const migration = securityClosureMigration();
    expect(source).toContain('body.action !== "log_incident" && body.action !== "apply_accommodation"');
    expect(source).toContain('userClient.rpc("institution_apply_attempt_accommodation"');
    expect(source).not.toContain("new Date(base + extraSeconds * 1000)");
    expect(migration).toContain("p_extra_seconds < 60 or p_extra_seconds > 7200");
    expect(migration).toContain("Finalized attempts cannot receive accommodations");
    expect(migration).toContain("for update");
  });

  it("enforces Paper Mode relationships below the server-action layer", () => {
    const migration = securityClosureMigration();
    expect(migration).toContain("validate_paper_mode_job_references");
    expect(migration).toContain("validate_paper_mode_booklet_references");
    expect(migration).toContain("validate_paper_mode_scan_page_references");
    expect(migration).toContain("assessment_version_id does not belong to this assessment");
    expect(migration).toContain("question_node_id does not belong to this Paper Mode assessment version");
  });

  it("does not claim student deletion succeeded when Auth deletion failed", () => {
    const source = read("app/owner/students/actions.ts");
    expect(source).toContain("deleteAuthUserOrThrow");
    expect(source).toContain("No profile was removed");
    expect(source).not.toContain("deleteAuthUserIfConfigured");
    expect(source).not.toContain("cleanup skipped; Supabase admin access is not configured");
  });

  it("exports question prompts to Moodle as inert text", () => {
    const source = read("supabase/functions/moodle-export-assessment/index.ts");
    expect(source).toContain("sanitizeMoodlePrompt");
    expect(source).toContain("escapeXml(stripHtml(value))");
    expect(source).not.toContain("function sanitizeHtml(value: string)");
  });
});
