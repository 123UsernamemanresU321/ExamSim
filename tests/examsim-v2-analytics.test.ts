import { describe, expect, it } from "vitest";
import { computeTeacherAnalyticsSnapshot } from "@/lib/examsim/analytics";

describe("Examsim V2 analytics", () => {
  it("computes score distribution, question difficulty, support flags, and rubric loss from stored marks", () => {
    const snapshot = computeTeacherAnalyticsSnapshot({
      attempts: [
        { id: "a1", assessment_id: "assess-1", state: "FINISHED_REVIEW", duration_seconds: 3600 },
        { id: "a2", assessment_id: "assess-1", state: "FINISHED_REVIEW", duration_seconds: 3600 },
        { id: "a3", assessment_id: "assess-1", state: "ACTIVE", duration_seconds: 3600 },
      ],
      questionNodes: [
        { id: "q1", assessment_version_id: "v1", node_key: "Q1", marks: 10, title: "Kinematics", response_mode: "typed_or_upload" },
        { id: "q2", assessment_version_id: "v1", node_key: "Q2", marks: 5, title: "Momentum", response_mode: "typed_text" },
      ],
      marks: [
        { attempt_id: "a1", question_node_id: "q1", awarded_marks: 8 },
        { attempt_id: "a1", question_node_id: "q2", awarded_marks: 2 },
        { attempt_id: "a2", question_node_id: "q1", awarded_marks: 4 },
        { attempt_id: "a2", question_node_id: "q2", awarded_marks: 1 },
      ],
      topicLinks: [
        { question_node_id: "q1", tag: "Mechanics" },
        { question_node_id: "q2", tag: "Mechanics" },
      ],
      rubricAwards: [
        { question_node_id: "q1", awarded_marks: 1, max_marks: 2, label: "Method mark" },
        { question_node_id: "q1", awarded_marks: 0, max_marks: 1, label: "Units" },
      ],
    });

    expect(snapshot.finishedAttemptCount).toBe(2);
    expect(snapshot.averagePercent).toBeCloseTo(50, 1);
    expect(snapshot.scoreDistribution.find((bucket) => bucket.label === "0-39%")?.count).toBe(1);
    expect(snapshot.scoreDistribution.find((bucket) => bucket.label === "60-79%")?.count).toBe(1);
    expect(snapshot.questionDifficulty[0]).toMatchObject({ questionNodeId: "q2", averagePercent: 30 });
    expect(snapshot.topicWeaknesses[0]).toMatchObject({ tag: "Mechanics", averagePercent: 50 });
    expect(snapshot.rubricLossBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Units", lostMarks: 1 }),
      ]),
    );
    expect(snapshot.studentSupportFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attemptId: "a2", reason: "Low score" }),
      ]),
    );
  });
});
