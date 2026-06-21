import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Examsim V3 invigilation reliability", () => {
  it("persists idempotent per-attempt broadcast acknowledgements without guest table access", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.includes("invigilation_acknowledgements"));
    expect(file).toBeTruthy();
    const migration = readFileSync(`supabase/migrations/${file}`, "utf8");
    expect(migration).toContain("create table if not exists public.invigilation_message_receipts");
    expect(migration).toContain("unique (message_id, attempt_id)");
    expect(migration).toContain("enable row level security");
    expect(migration).not.toMatch(/policy[\s\S]*to anon/i);
  });

  it("uses verified Edge boundaries for guest and authenticated acknowledgements", () => {
    for (const name of ["guest-acknowledge-invigilation-message", "acknowledge-invigilation-message"]) {
      const file = `supabase/functions/${name}/index.ts`;
      expect(existsSync(file), `${name} exists`).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source).toContain("invigilation_message_receipts");
      expect(source).toContain("upsert");
      expect(source).toContain("onConflict");
    }
    expect(readFileSync("supabase/functions/guest-acknowledge-invigilation-message/index.ts", "utf8")).toContain("verifyGuestAttemptToken");
    expect(readFileSync("supabase/functions/acknowledge-invigilation-message/index.ts", "utf8")).toContain("requireUser");
  });

  it("returns broadcasts to authenticated and guest students with acknowledgement state", () => {
    const shared = readFileSync("supabase/functions/_shared/invigilation-messages.ts", "utf8");
    const guest = readFileSync("supabase/functions/guest-get-attempt-state/index.ts", "utf8");
    const authenticated = readFileSync("supabase/functions/get-attempt-state/index.ts", "utf8");
    expect(shared).toContain("loadStudentVisibleMessages");
    expect(shared).toContain("acknowledged_at");
    expect(guest).toContain("loadStudentVisibleMessages");
    expect(authenticated).toContain("loadStudentVisibleMessages");
    expect(authenticated).toContain("invigilation_messages");
  });

  it("shows searchable risk summaries and acknowledgement coverage to invigilators", () => {
    const page = readFileSync("app/owner/exam-sessions/[id]/live/page.tsx", "utf8");
    const data = readFileSync("lib/examsim/session-data.ts", "utf8");
    const actions = readFileSync("app/owner/exam-sessions/[id]/live/actions.ts", "utf8");
    expect(page).toContain("Risk overview");
    expect(page).toContain('name="q"');
    expect(page).toContain('name="risk"');
    expect(page).toContain("acknowledgementCount");
    expect(data).toContain("riskLevel");
    expect(data).toContain("visibilityHiddenCount");
    expect(data).toContain("acknowledgementCount");
    expect(actions).toContain("requireOwnedSession");
  });
});
