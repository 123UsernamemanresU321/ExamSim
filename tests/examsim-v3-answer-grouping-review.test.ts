import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAnswerGroupingDraft,
  validateAnswerGroupingForApply,
} from "@/lib/examsim/answer-grouping-review";

describe("Examsim V3 answer grouping review", () => {
  it("builds deterministic review groups without losing or duplicating responses", () => {
    const groups = buildAnswerGroupingDraft([
      { id: "r1", attempt_id: "a1", question_node_id: "q1", answer_text: "2 metres", response_mode: "numerical" },
      { id: "r2", attempt_id: "a2", question_node_id: "q1", answer_text: "2 m", response_mode: "numerical" },
      { id: "r3", attempt_id: "a3", question_node_id: "q1", answer_text: "", response_mode: "numerical" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.normalizedAnswer === "2 m")?.memberResponseIds).toEqual(["r1", "r2"]);
    expect(groups.flatMap((group) => group.memberResponseIds).sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("rejects applying unapproved groups or marks above the question maximum", () => {
    expect(() => validateAnswerGroupingForApply([
      { id: "g1", approved: false, suggestedAwardedMarks: 1, memberCount: 2 },
    ], 2)).toThrow("Every answer group must be approved");

    expect(() => validateAnswerGroupingForApply([
      { id: "g1", approved: true, suggestedAwardedMarks: 3, memberCount: 2 },
    ], 2)).toThrow("cannot exceed 2");
  });

  it("persists runs, groups, members, audit events, and institution-scoped RLS", () => {
    const migrationPath = "supabase/migrations/20260619000600_v3_answer_grouping_review.sql";
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");
    for (const table of ["answer_grouping_runs", "answer_groups", "answer_group_members", "answer_group_audit_events"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("apply_answer_grouping_run");
    expect(migration).toContain("public.has_institution_permission");
    expect(migration).toContain("run.id = answer_groups.run_id");
    expect(migration).toContain("run.id = answer_group_members.run_id");
    expect(migration).toContain("response.question_node_id = run.question_node_id");
    expect(migration).toContain("node.id = answer_grouping_runs.question_node_id");
    expect(migration).not.toContain("run.owner_profile_id = owner_profile_id");
    expect(migration).not.toMatch(/to\s+anon/i);
  });

  it("provides manual regrouping, approval, and audited mark application controls", () => {
    expect(existsSync("app/owner/assessments/[id]/cross-mark/actions.ts")).toBe(true);
    expect(existsSync("components/owner/answer-grouping-review-panel.tsx")).toBe(true);
    const actions = readFileSync("app/owner/assessments/[id]/cross-mark/actions.ts", "utf8");
    const page = readFileSync("app/owner/assessments/[id]/cross-mark/page.tsx", "utf8");
    expect(actions).toContain('requireInstitutionPermission("marking"');
    expect(actions).toContain("moveAnswerGroupMemberAction");
    expect(actions).toContain("approveAnswerGroupAction");
    expect(actions).toContain("applyAnswerGroupingRunAction");
    expect(actions).toContain("auditInstitutionAction");
    expect(page).toContain("AnswerGroupingReviewPanel");
  });
});
