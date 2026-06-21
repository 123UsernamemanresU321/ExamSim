import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeTeacherAnalyticsSnapshot } from "@/lib/examsim/analytics";

describe("Examsim V3 standards and analytics", () => {
  it("defines owner-scoped curriculum trees and question/rubric links with RLS", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.includes("v3_curriculum_standards"));
    expect(file).toBeTruthy();
    const migration = readFileSync(`supabase/migrations/${file}`, "utf8");
    for (const table of ["curriculum_frameworks", "curriculum_standards", "question_standard_links", "rubric_standard_links"]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("public.has_institution_permission");
    expect(migration).not.toMatch(/to\s+anon/i);
  });

  it("provides a visual owner workflow and conservative sample seeds", () => {
    const page = readFileSync("app/owner/standards/page.tsx", "utf8");
    const actions = readFileSync("app/owner/standards/actions.ts", "utf8");
    expect(page).toContain("Curriculum standards");
    expect(page).toContain("Seed sample frameworks");
    expect(page).not.toContain("JSON.stringify");
    expect(actions).toContain('requireInstitutionPermission("assessment_authoring"');
    for (const framework of ["IB", "MYP", "IGCSE", "Olympiad/SAMO"]) expect(actions).toContain(framework);
    expect(actions).toContain("curriculum_standard.seeded");
  });

  it("uses each attempt's actual version and avoids double-counting parent marks", () => {
    const page = readFileSync("app/owner/analytics/page.tsx", "utf8");
    expect(page).toContain("assessment_version_id");
    expect(page).toContain("attemptVersionIds");

    const snapshot = computeTeacherAnalyticsSnapshot({
      attempts: [{ id: "a1", assessment_id: "paper", state: "FINISHED_REVIEW", duration_seconds: 1800 }],
      questionNodes: [
        { id: "root", assessment_id: "paper", node_key: "1", title: "Root", marks: 10, parent_node_id: null },
        { id: "part-a", assessment_id: "paper", node_key: "1.a", title: "Part A", marks: 4, parent_node_id: "root" },
        { id: "part-b", assessment_id: "paper", node_key: "1.b", title: "Part B", marks: 6, parent_node_id: "root" },
      ],
      marks: [
        { attempt_id: "a1", question_node_id: "part-a", awarded_marks: 2 },
        { attempt_id: "a1", question_node_id: "part-b", awarded_marks: 3 },
      ],
      standardLinks: [
        { question_node_id: "part-a", standard: "IB.AA.HL.CALC.1" },
        { question_node_id: "part-b", standard: "IB.AA.HL.CALC.1" },
      ],
    });
    expect(snapshot.averagePercent).toBe(50);
    expect(snapshot.timePerMarkSeconds).toBe(180);
    expect(snapshot.standardMastery[0]).toMatchObject({ standard: "IB.AA.HL.CALC.1", averagePercent: 50 });
  });
});
