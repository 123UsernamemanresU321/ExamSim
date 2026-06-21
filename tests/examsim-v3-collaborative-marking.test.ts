import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Examsim V3 collaborative marking", () => {
  it("persists anonymous, double-marking, and moderation workflow state with RLS", () => {
    const migration = readFileSync("supabase/migrations/20260619000500_v3_collaborative_marking.sql", "utf8");
    for (const table of ["assessment_grading_policies", "marking_submissions", "marking_reviews"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("anonymous_grading");
    expect(migration).toContain("double_marking");
    expect(migration).toContain("institution_marking_submission_self");
    expect(migration).toContain("institution_marking_review_moderation");
    expect(migration).toContain("create or replace function public.submit_marking_snapshot");
    expect(migration).toContain("create or replace function public.review_marking_submission");
    expect(migration).toContain("revoke insert, update, delete on public.marking_submissions from authenticated");
    expect(migration).toContain("revoke insert, update, delete on public.marking_reviews from authenticated");
    expect(migration).not.toMatch(/to\s+anon/i);
  });

  it("provides policy, independent submission, and moderation review UI", () => {
    expect(existsSync("components/owner/grading-policy-panel.tsx")).toBe(true);
    expect(existsSync("components/owner/marking-workflow-panel.tsx")).toBe(true);
    expect(existsSync("app/owner/marking-queue/moderation/page.tsx")).toBe(true);
    const actions = readFileSync("app/owner/marking-queue/actions.ts", "utf8");
    expect(actions).toContain('requireInstitutionPermission("assessment_authoring"');
    expect(actions).toContain('requireInstitutionPermission("marking"');
    expect(actions).toContain('requireInstitutionPermission("moderation"');
    expect(actions).toContain('rpc("submit_marking_snapshot"');
    expect(actions).toContain('rpc("review_marking_submission"');
    expect(actions).not.toContain('.from("marking_submissions").upsert');
    expect(actions).not.toContain('.from("marking_reviews").update');
    expect(actions).toContain("auditInstitutionAction");
  });

  it("avoids PL/pgSQL output-column ambiguity in marking snapshot submission", () => {
    const fix = readFileSync("supabase/migrations/20260620083947_fix_marking_snapshot_output_ambiguity.sql", "utf8");
    const constraintFix = readFileSync("supabase/migrations/20260620084239_correct_marking_snapshot_constraint_name.sql", "utf8");
    expect(fix).toContain("pg_get_functiondef('public.submit_marking_snapshot(uuid,uuid)'::regprocedure)");
    expect(fix).toContain("on conflict on constraint marking_submissions_attempt_id_marker_profile_id_marking_round_key");
    expect(fix).toContain("raise exception 'Expected marking snapshot conflict target was not found'");
    expect(constraintFix).toContain("on conflict on constraint marking_submissions_attempt_id_marker_profile_id_marking_ro_key");
    expect(constraintFix).toContain("raise exception 'Expected deployed marking snapshot constraint target was not found'");
  });

  it("masks identities in anonymous queues and exposes a moderation route", () => {
    const data = readFileSync("lib/usability-data.ts", "utf8");
    const queue = readFileSync("app/owner/marking-queue/page.tsx", "utf8");
    expect(data).toContain("anonymous_grading");
    expect(data).toContain("Anonymous script");
    expect(queue).toContain("/owner/marking-queue/moderation");
  });

  it("gates feedback release on completed required moderation", () => {
    const release = readFileSync("supabase/functions/release-feedback/index.ts", "utf8");
    expect(release).toContain("assessment_grading_policies");
    expect(release).toContain("marking_reviews");
    expect(release).toContain('review.status !== "approved"');
    expect(release).toContain("missingMarkedQuestionIds");
    expect(release).toContain("incomplete_marking");
    expect(release).toContain("release_checklist");
  });

  it("supports accessible marking shortcuts, bounded undo, and a visible release checklist", () => {
    const workspace = readFileSync("components/owner/marking-response-workspace.tsx", "utf8");
    const layout = readFileSync("components/owner/marking-layout.tsx", "utf8");
    expect(workspace).toContain("undoLastChange");
    expect(workspace).toContain("aria-keyshortcuts");
    expect(workspace).toContain("Shortcut legend");
    expect(workspace).toContain("aria-pressed");
    expect(layout).toContain("Release checklist");
    expect(layout).toContain("release_checklist");
  });

  it("provides a scoped marker workload and consistency dashboard", () => {
    const page = readFileSync("app/owner/marking-queue/workload/page.tsx", "utf8");
    const layout = readFileSync("app/owner/marking-queue/workload/layout.tsx", "utf8");
    expect(layout).toContain('InstitutionPermissionLayout permission="moderation"');
    expect(page).toContain("Marker workload");
    expect(page).toContain("Inter-marker consistency");
    expect(page).toContain("marker_assignments");
    expect(page).toContain("marking_submissions");
    expect(page).toContain("marking_reviews");
    expect(page).toContain("ownerProfileId");
  });
});
