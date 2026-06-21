import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeCohortAnalytics } from "@/lib/examsim/cohort-analytics";

describe("Examsim V3 cohort reporting", () => {
  it("computes group performance and at-risk students from scoped real marks", () => {
    const report = computeCohortAnalytics({
      cohorts: [{ id: "g1", name: "DP1", memberIds: ["s1", "s2"] }],
      attempts: [
        { id: "a1", studentProfileId: "s1", assessmentId: "exam", assessmentVersionId: "v1", state: "FINISHED_REVIEW", released: true },
        { id: "a2", studentProfileId: "s2", assessmentId: "exam", assessmentVersionId: "v1", state: "FINISHED_REVIEW", released: true },
      ],
      questions: [{ id: "q1", assessmentVersionId: "v1", marks: 10, parentNodeId: null }],
      marks: [{ attemptId: "a1", questionNodeId: "q1", awardedMarks: 8 }, { attemptId: "a2", questionNodeId: "q1", awardedMarks: 3 }],
      topicLinks: [{ questionNodeId: "q1", label: "Mechanics" }],
      standardLinks: [{ questionNodeId: "q1", label: "IB.PHY.1" }],
      assessments: [{ id: "exam", title: "Physics" }],
    });
    expect(report[0]?.averagePercent).toBe(55);
    expect(report[0]?.atRiskStudentCount).toBe(1);
    expect(report[0]?.topicMastery[0]).toMatchObject({ label: "Mechanics", averagePercent: 55 });
    expect(report[0]?.markingCompletionPercent).toBe(100);
  });

  it("provides an owner-scoped dashboard and permission-checked CSV export", () => {
    expect(existsSync("app/owner/analytics/cohorts/page.tsx")).toBe(true);
    expect(existsSync("app/api/owner/analytics/cohorts/route.ts")).toBe(true);
    const loader = readFileSync("lib/examsim/cohort-analytics-data.ts", "utf8");
    expect(loader).toContain("owner_profile_id");
    const route = readFileSync("app/api/owner/analytics/cohorts/route.ts", "utf8");
    expect(route).toContain('permissions.includes("exports")');
    expect(route).toContain("Cache-Control");
  });
});
