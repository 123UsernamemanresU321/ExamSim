import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFinalizationChecklist,
  calculateServerTimeDriftStatus,
  generateIcsEvent,
  getAllowedMaterialsForState,
  rankStudentUrgentActions,
  summarizeStudentProgress,
  type StudentAttemptCard,
  type StudentFeedbackCard,
} from "@/lib/student-experience";

describe("student experience utilities", () => {
  it("orders urgent actions by exam risk rather than start date alone", () => {
    const now = "2026-05-23T12:00:00.000Z";
    const actions = rankStudentUrgentActions(
      [
        attempt("upcoming", "WAITING", "2026-05-23T13:00:00.000Z"),
        attempt("feedback", "FINISHED_REVIEW", "2026-05-20T08:00:00.000Z", { unread_feedback_count: 1 }),
        attempt("upload", "UPLOAD_ONLY", "2026-05-23T08:00:00.000Z", { upload_deadline_at_utc: "2026-05-23T12:08:00.000Z" }),
        attempt("active", "ACTIVE", "2026-05-23T11:30:00.000Z"),
        attempt("failed", "UPLOAD_ONLY", "2026-05-23T08:00:00.000Z", { failed_upload_count: 1 }),
        attempt("finalize", "UPLOAD_ONLY", "2026-05-23T08:00:00.000Z", { needs_finalization: true }),
      ],
      now,
    );

    expect(actions.map((action) => action.attempt.id)).toEqual(["active", "failed", "upload", "finalize", "upcoming", "feedback"]);
  });

  it("exports ICS events with start, end, upload deadline, and Exam Vault URL", () => {
    const ics = generateIcsEvent({
      id: "attempt_1",
      title: "MODS Mock Week 7 120",
      paper_code: "MODS-120-W7",
      start_at_utc: "2026-05-23T12:00:00.000Z",
      end_at_utc: "2026-05-23T14:00:00.000Z",
      upload_deadline_at_utc: "2026-05-23T14:15:00.000Z",
      display_timezone: "Africa/Johannesburg",
      exam_url: "https://examvault.tutor-mcp.com/student/attempts/attempt_1/waiting",
    });

    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:MODS Mock Week 7 120");
    expect(ics).toContain("DTSTART:20260523T120000Z");
    expect(ics).toContain("DTEND:20260523T140000Z");
    expect(ics).toContain("Upload deadline: 2026-05-23T14:15:00.000Z");
    expect(ics).toContain("URL:https://examvault.tutor-mcp.com/student/attempts/attempt_1/waiting");
  });

  it("classifies server-time drift without making local time authoritative", () => {
    expect(calculateServerTimeDriftStatus("2026-05-23T12:00:00.000Z", "2026-05-23T12:00:03.000Z").status).toBe("synced");
    expect(calculateServerTimeDriftStatus("2026-05-23T12:00:00.000Z", "2026-05-23T12:00:35.000Z").status).toBe("minor_drift");
    expect(calculateServerTimeDriftStatus("2026-05-23T12:00:00.000Z", "2026-05-23T12:05:00.000Z").status).toBe("suspicious_drift");
    expect(calculateServerTimeDriftStatus(null, "2026-05-23T12:05:00.000Z").status).toBe("unable_to_verify");
  });

  it("enforces allowed material visibility against attempt state", () => {
    const materials = [
      material("before", "before_exam"),
      material("active", "active_only"),
      material("after", "after_finish"),
      material("always", "always"),
      material("owner", "owner_only"),
    ];

    expect(getAllowedMaterialsForState(materials, "WAITING").map((item) => item.id)).toEqual(["before", "always"]);
    expect(getAllowedMaterialsForState(materials, "ACTIVE").map((item) => item.id)).toEqual(["active", "always"]);
    expect(getAllowedMaterialsForState(materials, "FINISHED_REVIEW").map((item) => item.id)).toEqual(["after", "always"]);
  });

  it("builds a pre-finalization checklist that blocks required blank declarations", () => {
    const checklist = buildFinalizationChecklist({
      requireBlankForSkipped: true,
      typedResponsesPending: false,
      uploadItems: [
        { slot_id: "slot_1", label: "Q1", status: "uploaded", file_name: "q1.pdf", sanity_status: "accepted", warnings: [] },
        { slot_id: "slot_2", label: "Q2", status: "pending", file_name: null, sanity_status: null, warnings: [] },
        { slot_id: "slot_3", label: "Q3", status: "failed", file_name: "q3.pdf", sanity_status: "failed", warnings: ["Unreadable"] },
      ],
    });

    expect(checklist.canFinalize).toBe(false);
    expect(checklist.items.map((item) => item.severity)).toEqual(["ok", "blocked", "blocked"]);
    expect(checklist.blockingReasons).toEqual(expect.arrayContaining(["Q2 still needs an upload or blank submission.", "Q3 upload failed and must be retried or submitted blank."]));
  });

  it("summarizes only released progress data", () => {
    const progress = summarizeStudentProgress({
      attempts: [
        attempt("released", "FINISHED_REVIEW", "2026-05-20T08:00:00.000Z", { released_score_percent: 80, upload_completion_percent: 100 }),
        attempt("unreleased", "FINISHED_REVIEW", "2026-05-21T08:00:00.000Z", { upload_completion_percent: 50 }),
      ],
      feedback: [feedback("released", true), feedback("unread", false)],
      correctionsSubmitted: 1,
      releasedMistakeCounts: new Map([["Missing units", 3]]),
      confidenceRatings: [4, 2],
    });

    expect(progress.completed_attempts).toBe(2);
    expect(progress.average_released_score).toBe(80);
    expect(progress.feedback_read_rate).toBe(50);
    expect(progress.common_mistakes[0]).toEqual({ label: "Missing units", count: 3 });
    expect(progress.confidence_average).toBe(3);
  });

  it("documents required auth-aware navigation and student-side routes", () => {
    const appHeader = readFileSync("components/app-header.tsx", "utf8");
    const studentLayout = readFileSync("app/student/layout.tsx", "utf8");

    expect(appHeader).toContain("AuthAwareHeaderNav");
    expect(appHeader).not.toContain("AuthNav");
    for (const path of [
      "/student/command-center",
      "/student/timeline",
      "/student/archive",
      "/student/feedback",
      "/student/progress",
      "/student/mistake-patterns",
      "/student/devices",
      "/student/accessibility",
      "/student/security",
      "/student/notification-settings",
    ]) {
      expect(studentLayout).toContain(path);
    }
  });
});

function attempt(id: string, state: StudentAttemptCard["state"], start: string, overrides: Partial<StudentAttemptCard> = {}): StudentAttemptCard {
  return {
    id,
    title: id,
    paper_code: null,
    state,
    start_at_utc: start,
    end_at_utc: "2026-05-23T14:00:00.000Z",
    upload_deadline_at_utc: null,
    display_timezone: "Africa/Johannesburg",
    unread_feedback_count: 0,
    failed_upload_count: 0,
    needs_finalization: false,
    correction_pending: false,
    released_score_percent: null,
    upload_completion_percent: 0,
    ...overrides,
  };
}

function material(id: string, visibility_policy: "before_exam" | "active_only" | "after_finish" | "always" | "owner_only") {
  return {
    id,
    title: id,
    material_type: "reference" as const,
    visibility_policy,
    object_path: null,
    content_html: null,
  };
}

function feedback(attemptId: string, read: boolean): StudentFeedbackCard {
  return {
    attempt_id: attemptId,
    title: attemptId,
    paper_code: null,
    released_at: "2026-05-23T12:00:00.000Z",
    read_at: read ? "2026-05-23T12:30:00.000Z" : null,
    marks_released: true,
    comments_released: true,
    annotated_pdf_available: false,
    corrections_required: false,
  };
}
