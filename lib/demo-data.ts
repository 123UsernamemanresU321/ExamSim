import type { AttemptState } from "@/lib/constants";
import type { NormalizedAssessmentPackage, QuestionNode } from "@/lib/assessment-package";
import { computeAttemptState, getCountdownTarget } from "@/lib/attempt-state";
import { summarizeModerationEvents } from "@/lib/moderation";

const serverNowUtc = "2026-05-05T08:15:00.000Z";

export const sampleQuestions: QuestionNode[] = [
  {
    node_id: "q1",
    node_key: "1",
    ordinal: 1,
    node_type: "question",
    title: "Algebraic structure",
    marks: 10,
    response_mode: "typed_or_upload",
    prompt: {
      html: "<p>Let <strong>n</strong> be a positive integer. Prove that the expression below is divisible by 6.</p>",
      latex: "n^3-n",
    },
    children: [
      {
        node_id: "q1a",
        node_key: "1(a)",
        ordinal: 1,
        node_type: "subquestion",
        marks: 4,
        response_mode: "typed_text",
        prompt: {
          html: "<p>Show that one of three consecutive integers is divisible by 3.</p>",
        },
      },
      {
        node_id: "q1b",
        node_key: "1(b)",
        ordinal: 2,
        node_type: "subquestion",
        marks: 6,
        response_mode: "upload_pdf",
        prompt: {
          html: "<p>Complete the divisibility proof and upload your written solution.</p>",
        },
      },
    ],
  },
  {
    node_id: "q2",
    node_key: "2",
    ordinal: 2,
    node_type: "question",
    title: "Function analysis",
    marks: 8,
    response_mode: "typed_text",
    prompt: {
      html: "<p>Find all real values of x such that the function reaches its minimum.</p>",
      latex: "f(x)=x^2-4x+7",
    },
  },
];

export const samplePackage: NormalizedAssessmentPackage = {
  schema_version: "2026-05-05",
  assessment: {
    id: "asm_demo",
    title: "Olympiad Mock Paper 1",
    paper_code: "MATH-MOCK-01",
    assessment_kind: "exam",
    source_kind: "json",
    authoring_origin: "imported",
    external_schedule_ref: "adaptive-calendar:math:week-18",
    display_timezone: "Africa/Johannesburg",
  },
  delivery: {
    delivery_mode: "browser",
    start_at_utc: "2026-05-05T08:00:00.000Z",
    duration_seconds: 7200,
    solutions_requested: true,
    upload_only_grace_seconds: 1800,
    response_policy: {
      typed_allowed: true,
      mixed_mode_allowed: true,
      per_question_pdf_upload: true,
      blank_submission_required_for_unattempted: false,
    },
  },
  source: {
    normalized_by: "demo-seed:v1",
    parse_confidence: 0.94,
    requires_owner_review: false,
  },
  questions: sampleQuestions,
};

export const sampleAssessment = {
  id: "asm_demo",
  title: samplePackage.assessment.title,
  paper_code: samplePackage.assessment.paper_code,
  assessment_kind: samplePackage.assessment.assessment_kind,
  status: "published",
  parse_confidence: 0.94,
  created_at: "2026-05-05T06:00:00.000Z",
};

export const sampleStudents = [
  {
    id: "student_01",
    display_name: "Naledi Mokoena",
    login_code: "NAL-2048",
    activated_at: "2026-05-04T16:00:00.000Z",
  },
  {
    id: "student_02",
    display_name: "Owner practice persona",
    login_code: "OWN-0001",
    activated_at: null,
  },
];

export const sampleAttempts = [
  {
    id: "att_waiting",
    title: "IB-style Physics Paper 2",
    paper_code: "PHY-HL-P2",
    student: "Naledi Mokoena",
    start_at_utc: "2026-05-05T10:00:00.000Z",
    end_at_utc: "2026-05-05T12:00:00.000Z",
    upload_deadline_at_utc: "2026-05-05T12:30:00.000Z",
    duration_seconds: 7200,
    display_timezone: "Africa/Johannesburg",
    solutions_requested: true,
    delivery_mode: "browser",
  },
  {
    id: "att_active",
    title: samplePackage.assessment.title,
    paper_code: samplePackage.assessment.paper_code,
    student: "Owner practice persona",
    start_at_utc: "2026-05-05T08:00:00.000Z",
    end_at_utc: "2026-05-05T10:00:00.000Z",
    upload_deadline_at_utc: "2026-05-05T10:30:00.000Z",
    duration_seconds: 7200,
    display_timezone: "Africa/Johannesburg",
    solutions_requested: true,
    delivery_mode: "browser",
  },
  {
    id: "att_upload",
    title: "School Test: Calculus",
    paper_code: "CALC-T1",
    student: "Naledi Mokoena",
    start_at_utc: "2026-05-05T05:00:00.000Z",
    end_at_utc: "2026-05-05T08:00:00.000Z",
    upload_deadline_at_utc: "2026-05-05T08:30:00.000Z",
    duration_seconds: 10800,
    display_timezone: "Africa/Johannesburg",
    solutions_requested: true,
    delivery_mode: "browser",
  },
  {
    id: "att_finished",
    title: "Quiz: Number Theory",
    paper_code: "NT-Q2",
    student: "Naledi Mokoena",
    start_at_utc: "2026-05-05T04:00:00.000Z",
    end_at_utc: "2026-05-05T05:00:00.000Z",
    upload_deadline_at_utc: null,
    duration_seconds: 3600,
    display_timezone: "Africa/Johannesburg",
    solutions_requested: false,
    delivery_mode: "browser",
  },
] as const;

export function attemptWithState(id = "att_active") {
  const attempt = sampleAttempts.find((item) => item.id === id) ?? sampleAttempts[1];
  const state = computeAttemptState({
    serverNowUtc,
    startAtUtc: attempt.start_at_utc,
    endAtUtc: attempt.end_at_utc,
    uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
    solutionsRequested: attempt.solutions_requested,
  });
  const countdownTargetUtc = getCountdownTarget(state, {
    startAtUtc: attempt.start_at_utc,
    endAtUtc: attempt.end_at_utc,
    uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
  });
  return { ...attempt, state, server_now_utc: serverNowUtc, countdown_target_utc: countdownTargetUtc };
}

export const sampleReport = summarizeModerationEvents(
  [
    {
      event_type: "fullscreen.exit",
      server_received_at: "2026-05-05T08:20:00.000Z",
      payload_json: { fullscreen: false },
    },
    {
      event_type: "visibility.hidden",
      server_received_at: "2026-05-05T08:31:00.000Z",
      payload_json: { document_visibility_state: "hidden" },
    },
    {
      event_type: "visibility.visible",
      server_received_at: "2026-05-05T08:31:18.000Z",
      payload_json: { document_visibility_state: "visible" },
    },
    {
      event_type: "heartbeat",
      server_received_at: "2026-05-05T08:32:00.000Z",
      payload_json: {},
    },
  ],
  [
    { status: "uploaded", uploaded_at: "2026-05-05T08:10:00.000Z", required: true },
    { status: "blank_placeholder", uploaded_at: "2026-05-05T08:12:00.000Z", required: false },
  ],
);

export function stateTone(state: AttemptState) {
  if (state === "ACTIVE") return "success";
  if (state === "UPLOAD_ONLY") return "warning";
  if (state === "FINISHED_REVIEW") return "neutral";
  return "accent";
}
