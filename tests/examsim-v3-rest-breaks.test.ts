import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Examsim V3 server-controlled rest breaks", () => {
  it("persists owner-scoped pause intervals and atomic start/resume functions", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.includes("v3_rest_break_timing"));
    expect(file).toBeTruthy();
    const migration = readFileSync(`supabase/migrations/${file}`, "utf8");
    expect(migration).toContain("create table if not exists public.attempt_pause_intervals");
    expect(migration).toContain("owner_profile_id uuid not null references public.profiles(id)");
    expect(migration).toMatch(/owner_profile_id,\s*created_by_profile_id\s*\) values \([\s\S]*actor_profile_id,\s*actor_profile_id/);
    expect(migration.match(/and owner_profile_id = public\.current_profile_id\(\)/g)).toHaveLength(2);
    expect(migration).toContain("start_attempt_rest_break");
    expect(migration).toContain("resume_attempt_rest_break");
    expect(migration).toContain("for update");
    expect(migration).toContain("end_at_utc = end_at_utc + make_interval");
    expect(migration).not.toMatch(/to\s+anon/i);
  });

  it("routes pause and resume through atomic server timing operations", () => {
    const actions = readFileSync("app/owner/exam-sessions/[id]/live/actions.ts", "utf8");
    expect(actions).toContain('rpc("institution_start_attempt_rest_break"');
    expect(actions).toContain('rpc("institution_resume_attempt_rest_break"');
    expect(actions).toContain('rpc("institution_apply_timing_intervention"');
    expect(actions).toContain('requireInstitutionPermission("invigilation"');
    expect(actions).not.toContain('update({ paused_at: null })');
  });

  it("passes paused_at into every sensitive Edge state recomputation", () => {
    const functionNames = [
      "get-attempt-state",
      "get-attempt-package",
      "save-text-response",
      "set-question-flag",
      "issue-upload-slot-url",
      "confirm-upload-slot",
      "submit-blank-slot",
      "guest-get-attempt-state",
      "guest-get-attempt-package",
      "guest-save-response",
      "guest-issue-upload-slot-url",
      "guest-confirm-upload-slot",
      "guest-finalize-attempt",
    ];
    for (const name of functionNames) {
      const file = `supabase/functions/${name}/index.ts`;
      expect(existsSync(file), `${name} exists`).toBe(true);
      expect(readFileSync(file, "utf8"), `${name} checks paused_at`).toContain("pausedAtUtc:");
    }
  });

  it("locks both guest and authenticated workspaces while the server reports PAUSED", () => {
    const guest = readFileSync("components/exam/guest-exam-workspace.tsx", "utf8");
    const authenticated = readFileSync("components/exam/exam-workspace.tsx", "utf8");
    expect(guest).toContain("RestBreakPanel");
    expect(guest).toContain('state?.state === "PAUSED"');
    expect(authenticated).toContain("AuthenticatedRestBreakPanel");
    expect(authenticated).toContain('attempt.state === "PAUSED"');
    expect(authenticated).toContain("setInterval");
  });
});
