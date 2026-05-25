import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFinalizationChecklist,
  calculateServerTimeDriftStatus,
  generateIcsEvent,
  getAllowedMaterialsForState,
  rankStudentUrgentActions,
  releasedScorePercent,
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
        attempt("released", "FINISHED_REVIEW", "2026-05-20T08:00:00.000Z", { subject: "Physics", assessment_kind: "test", paper_code: "PHY-P1", released_score_percent: 80, upload_completion_percent: 100 }),
        attempt("second", "FINISHED_REVIEW", "2026-05-20T08:00:00.000Z", { subject: "Physics", assessment_kind: "exam", paper_code: "PHY-P2", released_score_percent: 60, upload_completion_percent: 100 }),
        attempt("unreleased", "FINISHED_REVIEW", "2026-05-21T08:00:00.000Z", { subject: "Chemistry", assessment_kind: "test", upload_completion_percent: 50 }),
      ],
      feedback: [feedback("released", true), feedback("unread", false)],
      correctionsSubmitted: 1,
      releasedMistakeCounts: new Map([["Missing units", 3]]),
      confidenceRatings: [4, 2],
    });

    expect(progress.completed_attempts).toBe(3);
    expect(progress.average_released_score).toBe(70);
    expect(progress.feedback_read_rate).toBe(50);
    expect(progress.common_mistakes[0]).toEqual({ label: "Missing units", count: 3 });
    expect(progress.confidence_average).toBe(3);
    expect(progress.score_groups).toEqual(expect.arrayContaining([
      { kind: "subject", key: "Physics", label: "Physics", average_released_score: 70, attempt_count: 2 },
      { kind: "assessment_kind", key: "test", label: "test", average_released_score: 80, attempt_count: 1 },
      { kind: "paper_code", key: "PHY-P1", label: "PHY-P1", average_released_score: 80, attempt_count: 1 },
    ]));
  });

  it("keeps readiness checks connected to persistent device profiles", () => {
    const actionSource = readFileSync("app/student/student-actions.ts", "utf8");
    const readinessSource = readFileSync("components/student/student-interactive-panels.tsx", "utf8");

    expect(actionSource).toContain('from("student_device_checks").insert');
    expect(actionSource).toContain('from("student_devices").upsert');
    expect(actionSource).toContain('onConflict: "student_profile_id,device_id_hash"');
    expect(readinessSource).toContain("useEffect");
    expect(readinessSource).toContain("saveReadinessCheck");
  });

  it("treats legacy visible releases with null release_marks as marks released", () => {
    expect(releasedScorePercent({ total_awarded_marks: 16, total_available_marks: 20, release_marks: null })).toBe(80);
    expect(releasedScorePercent({ total_awarded_marks: 16, total_available_marks: 20, release_marks: false })).toBeNull();
  });

  it("keeps student experience loaders on Edge-mediated released feedback results", () => {
    const source = readFileSync("lib/student-experience.ts", "utf8");
    expect(source).toContain('invokeEdgeFunctionServer<StudentResultsListResponse>("list-student-results"');
    expect(source).not.toContain('from("feedback_releases")');
  });

  it("marks released feedback as read when the student opens the result page", () => {
    const workspace = readFileSync("components/student/student-results-workspace.tsx", "utf8");
    const page = readFileSync("app/student/attempts/[id]/results/page.tsx", "utf8");
    const actions = readFileSync("app/student/student-actions.ts", "utf8");
    const edge = readFileSync("supabase/functions/get-student-results/index.ts", "utf8");

    expect(workspace).toContain("markStudentFeedbackRead");
    expect(workspace).toContain("getFeedbackReleaseId");
    expect(workspace).toContain("feedback_release_id");
    expect(workspace).toContain("useEffect");
    expect(page).toContain("getStudentAttemptResultsWorkspace");
    expect(actions).toContain("if (error) throw");
    expect(actions).toContain('revalidatePath("/student/feedback")');
    expect(actions).toContain('revalidatePath("/student/command-center")');
    expect(edge).toContain("markVisibleFeedbackRead");
    expect(edge).toContain('from("student_feedback_reads").upsert');
  });

  it("documents required auth-aware navigation and student-side routes", () => {
    const appHeader = readFileSync("components/app-header.tsx", "utf8");
    const studentLayout = readFileSync("app/student/layout.tsx", "utf8");
    const studentSidebar = readFileSync("components/student/student-sidebar-nav.tsx", "utf8");

    expect(appHeader).toContain("AuthAwareHeaderNav");
    expect(appHeader).not.toContain("AuthNav");
    expect(studentLayout).toContain("StudentSidebarNav");
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
      expect(studentSidebar).toContain(path);
    }
  });

  it("keeps dark action controls on student surfaces readable", () => {
    const button = readFileSync("components/ui/button.tsx", "utf8");
    const progressFilter = readFileSync("components/student/student-progress-score-filter.tsx", "utf8");
    const panels = readFileSync("components/student/student-experience-panels.tsx", "utf8");

    expect(button).toContain("bg-[var(--primary)] !text-white");
    expect(button).toContain("bg-[var(--danger)] !text-white");
    expect(progressFilter).toContain("bg-[var(--primary)] !text-white");
    expect(panels).toContain('import { Button, ButtonLink } from "@/components/ui/button"');
    expect(panels).toContain('<Button type="submit">');
  });
});

function attempt(id: string, state: StudentAttemptCard["state"], start: string, overrides: Partial<StudentAttemptCard> = {}): StudentAttemptCard {
  return {
    id,
    title: id,
    paper_code: null,
    subject: null,
    assessment_kind: "exam",
    state,
    start_at_utc: start,
    end_at_utc: "2026-05-23T14:00:00.000Z",
    upload_deadline_at_utc: null,
    display_timezone: "Africa/Johannesburg",
    unread_feedback_count: 0,
    failed_upload_count: 0,
    needs_finalization: false,
    correction_pending: false,
    feedback_released: false,
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
