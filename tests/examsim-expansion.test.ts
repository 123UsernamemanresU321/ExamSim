import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildStudentNumber,
  classifyExamSessionAccess,
  hashExamSecret,
  normalizeExamCode,
  normalizeStudentNumber,
  validateGuestIdentity,
} from "../lib/examsim/guest-access";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Examsim product expansion foundations", () => {
  it("adds guest-compatible exam session schema without exposing access tokens", () => {
    const migration = read("supabase/migrations/20260616165023_examsim_product_expansion.sql");

    for (const table of [
      "exam_sessions",
      "student_roster_entries",
      "attempt_access_tokens",
      "source_documents",
      "source_pages",
      "question_source_regions",
      "rubric_templates",
      "rubric_template_items",
      "rubric_item_awards",
      "invigilation_messages",
      "live_interventions",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).toContain("alter column assignee_profile_id drop not null");
    expect(migration).toContain("guest_student_name text null");
    expect(migration).toContain("guest_student_number text null");
    expect(migration).toContain("revoke all on public.attempt_access_tokens from anon, authenticated");
    expect(migration).not.toContain("student reads attempt access tokens");
    expect(migration).not.toContain("guest reads attempt access tokens");
  });

  it("normalizes human exam codes and hashes secrets for storage", async () => {
    expect(normalizeExamCode("  mock  week-7 120 ")).toBe("MOCK-WEEK-7-120");
    expect(normalizeExamCode("ab_cd.123")).toBe("AB-CD-123");

    const first = await hashExamSecret("MOCK-WEEK-7-120");
    const second = await hashExamSecret("mock week 7 120");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  it("validates roster-first guest identities and memorable student numbers", () => {
    expect(normalizeStudentNumber(" dp1 007 ")).toBe("DP1-007");
    expect(normalizeStudentNumber("myp5-012")).toBe("MYP5-012");
    expect(buildStudentNumber("G11", 26)).toBe("G11-026");
    expect(buildStudentNumber("E", 1)).toBe("E001");

    expect(validateGuestIdentity({ studentName: "Eric Huang", studentNumber: "DP1-007" })).toEqual({
      ok: true,
      studentName: "Eric Huang",
      studentNumber: "DP1-007",
      classGroup: null,
    });

    expect(validateGuestIdentity({ studentName: "E", studentNumber: "bad<script>" }).ok).toBe(false);
    expect(validateGuestIdentity({ studentName: " ".repeat(5), studentNumber: "DP1-007" }).ok).toBe(false);
  });

  it("classifies exam-code entry states without releasing exam content early", () => {
    const now = new Date("2026-06-16T10:00:00.000Z");
    const base = {
      status: "published",
      openAtUtc: "2026-06-16T09:00:00.000Z",
      startAtUtc: "2026-06-16T10:00:00.000Z",
      closeAtUtc: "2026-06-16T12:00:00.000Z",
    } as const;

    expect(classifyExamSessionAccess({ ...base, openAtUtc: "2026-06-16T11:00:00.000Z" }, now)).toBe("not_open");
    expect(classifyExamSessionAccess(base, now)).toBe("live");
    expect(classifyExamSessionAccess({ ...base, startAtUtc: "2026-06-16T11:00:00.000Z" }, now)).toBe("lobby");
    expect(classifyExamSessionAccess({ ...base, closeAtUtc: "2026-06-16T09:59:00.000Z" }, now)).toBe("closed");
    expect(classifyExamSessionAccess({ ...base, status: "draft" }, now)).toBe("invalid");
  });

  it("wires public exam code routes and guest edge boundaries", () => {
    expect(read("app/exam/page.tsx")).toContain("ExamCodeEntryForm");
    expect(read("app/exam/identity/page.tsx")).toContain("GuestIdentityForm");
    expect(read("app/exam/live/page.tsx")).toContain("GuestExamWorkspace");
    expect(read("supabase/functions/resolve-exam-code/index.ts")).toContain("hashExamSecret");
    expect(read("supabase/functions/join-exam-session/index.ts")).toContain("attempt_access_tokens");
    expect(read("supabase/functions/guest-get-attempt-package/index.ts")).toContain("verifyGuestAttemptToken");
    expect(read("supabase/functions/guest-save-response/index.ts")).toContain("state_token");
    expect(read("supabase/functions/guest-finalize-attempt/index.ts")).toContain("upsert");
  });

  it("wires owner exam session management without storing plaintext codes", () => {
    expect(read("components/owner/sidebar-nav.tsx")).toContain("/owner/exam-sessions");
    expect(read("app/owner/exam-sessions/page.tsx")).toContain("ExamSessionForm");
    expect(read("app/owner/exam-sessions/actions.ts")).toContain("hashExamSecret");
    expect(read("app/owner/exam-sessions/actions.ts")).toContain("code_hash");
    expect(read("app/owner/exam-sessions/actions.ts")).toContain("code_display_hint");
    expect(read("app/owner/exam-sessions/[id]/share/page.tsx")).toContain("/exam");
    expect(read("app/owner/exam-sessions/[id]/live/page.tsx")).toContain("getLiveSessionAttempts");
    expect(read("app/owner/exam-sessions/actions.ts")).not.toContain("code_plaintext");
  });

  it("adds visual authoring, compiler, LaTeX, and rubric teacher workflows", () => {
    expect(read("app/owner/assessments/[id]/page.tsx")).toContain("/authoring");
    expect(read("app/owner/assessments/[id]/page.tsx")).toContain("/compiler");
    expect(read("app/owner/assessments/[id]/page.tsx")).toContain("/latex");
    expect(read("app/owner/assessments/[id]/page.tsx")).toContain("/rubrics");
    expect(read("app/owner/assessments/[id]/authoring/page.tsx")).toContain("Visual Question Editor");
    expect(read("app/owner/assessments/[id]/authoring/actions.ts")).toContain("updateQuestionCardAction");
    expect(read("app/owner/assessments/[id]/compiler/page.tsx")).toContain("Manual region fallback");
    expect(read("app/owner/assessments/[id]/latex/page.tsx")).toContain("\\\\question[6][topic=modular arithmetic]");
    expect(read("app/owner/assessments/[id]/rubrics/page.tsx")).toContain("Rubrics and Reusable Feedback");
  });

  it("adds live invigilation controls and guest technical issue reporting", () => {
    expect(read("app/owner/exam-sessions/[id]/live/page.tsx")).toContain("sendSessionBroadcastAction");
    expect(read("app/owner/exam-sessions/[id]/live/page.tsx")).toContain("applyLiveInterventionAction");
    expect(read("app/owner/exam-sessions/[id]/live/actions.ts")).toContain("live_interventions");
    expect(read("app/owner/exam-sessions/[id]/live/actions.ts")).toContain("force_submit");
    expect(read("supabase/functions/guest-send-invigilation-message/index.ts")).toContain("verifyGuestAttemptToken");
    expect(read("supabase/functions/guest-send-invigilation-message/index.ts")).toContain("student_guest");
    expect(read("components/exam/guest-exam-workspace.tsx")).toContain("Report technical issue");
  });

  it("adds owner reconciliation for guest attempts and roster-first linking", () => {
    expect(read("app/owner/exam-sessions/[id]/page.tsx")).toContain("Reconcile guests");
    expect(read("app/owner/exam-sessions/[id]/reconcile/page.tsx")).toContain("Guest attempt reconciliation");
    expect(read("app/owner/exam-sessions/[id]/reconcile/actions.ts")).toContain("linkGuestAttemptToRosterAction");
    expect(read("app/owner/exam-sessions/[id]/reconcile/actions.ts")).toContain("assignee_profile_id");
    expect(read("lib/examsim/session-data.ts")).toContain("getReconciliationCandidates");
  });
});
