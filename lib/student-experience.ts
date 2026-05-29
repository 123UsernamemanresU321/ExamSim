import { computeAttemptState } from "@/lib/attempt-state";
import { invokeEdgeFunctionServer } from "@/lib/edge/server";
import { calculateServerTimeDriftStatus, type ServerTimeDriftStatus } from "@/lib/student-experience-core";
import { listStudentAttempts } from "@/lib/live-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoModeEnabled } from "@/lib/runtime";
import type {
  AssessmentMaterial,
  Attempt,
  AttemptAccommodation,
  Json,
  MistakeCategory,
  MistakeInstance,
  StudentAccessibilityPreferences,
  StudentConfidenceRating,
  StudentDevice,
  StudentDeviceCheck,
  StudentFeedbackRead,
  StudentIncidentReport,
  StudentNotification,
  StudentNotificationPreferences,
  StudentPerformancePreferences,
  SubmissionReceipt,
  UploadQueueEvent,
  UploadSanityCheck,
  UploadSlot,
} from "@/types/database";
import type { AttemptState } from "@/lib/constants";

export type StudentAttemptCard = {
  id: string;
  title: string;
  paper_code: string | null;
  subject: string | null;
  assessment_kind: string | null;
  state: AttemptState;
  start_at_utc: string;
  end_at_utc: string;
  upload_deadline_at_utc: string | null;
  display_timezone: string;
  unread_feedback_count: number;
  failed_upload_count: number;
  needs_finalization: boolean;
  correction_pending: boolean;
  feedback_released: boolean;
  released_score_percent: number | null;
  upload_completion_percent: number;
};

export type StudentUrgentAction = {
  kind: "active_exam" | "failed_upload" | "upload_deadline" | "needs_finalization" | "starting_soon" | "feedback_released" | "correction_pending";
  label: string;
  href: string;
  priority: number;
  attempt: StudentAttemptCard;
};

export type StudentMaterial = Pick<AssessmentMaterial, "id" | "title" | "material_type" | "visibility_policy" | "object_path" | "content_html"> & {
  signed_url?: string | null;
};

export type StudentFeedbackCard = {
  attempt_id: string;
  feedback_release_id?: string | null;
  title: string;
  paper_code: string | null;
  released_at: string;
  read_at: string | null;
  marks_released: boolean;
  comments_released: boolean;
  annotated_pdf_available: boolean;
  corrections_required: boolean;
};

type StudentResultsListResponse = {
  results: StudentResultRelease[];
};

type StudentResultRelease = {
  feedback_release_id?: string | null;
  attempt_id: string;
  assessment_title: string;
  paper_code: string | null;
  released_at: string;
  total_awarded_marks: number | null;
  total_available_marks: number | null;
  release_marks?: boolean | null;
  release_comments?: boolean | null;
  release_annotated_pdfs?: boolean | null;
};

export type FinalizationUploadItem = {
  slot_id: string;
  label: string;
  status: UploadSlot["status"] | "queued" | "uploading" | "failed" | "retrying" | "expired";
  file_name: string | null;
  sanity_status: UploadSanityCheck["status"] | null;
  warnings: string[];
};

export type FinalizationChecklistItem = FinalizationUploadItem & {
  severity: "ok" | "warning" | "blocked";
  message: string;
};

export type FinalizationChecklist = {
  canFinalize: boolean;
  items: FinalizationChecklistItem[];
  blockingReasons: string[];
  warningReasons: string[];
};

export type StudentProgressSnapshot = {
  completed_attempts: number;
  average_released_score: number | null;
  score_groups: StudentProgressScoreGroup[];
  upload_completion_rate: number;
  feedback_read_rate: number;
  corrections_submitted: number;
  common_mistakes: { label: string; count: number }[];
  confidence_average: number | null;
};

export type StudentProgressScoreGroup = {
  kind: "subject" | "assessment_kind" | "paper_code";
  key: string;
  label: string;
  average_released_score: number;
  attempt_count: number;
};

export type StudentCommandCenterData = {
  attempts: StudentAttemptCard[];
  urgentActions: StudentUrgentAction[];
  timeline: StudentAttemptCard[];
  feedbackPreview: StudentFeedbackCard[];
  notifications: StudentNotification[];
  recentReceipts: SubmissionReceipt[];
  devices: StudentDevice[];
  latestDeviceCheck: StudentDeviceCheck | null;
  progress: StudentProgressSnapshot;
  serverNowUtc: string;
};

export { calculateServerTimeDriftStatus, type ServerTimeDriftStatus };

export type StudentReadinessData = {
  attempt: StudentAttemptCard | null;
  latestCheck: StudentDeviceCheck | null;
  serverNowUtc: string;
};

export type StudentFinalizeData = {
  attempt: StudentAttemptCard | null;
  uploadItems: FinalizationUploadItem[];
  checklist: FinalizationChecklist;
};

export type StudentRecoveryStatusData = {
  attempt: StudentAttemptCard | null;
  slots: UploadSlot[];
  queueEvents: UploadQueueEvent[];
  incidents: StudentIncidentReport[];
  accommodations: AttemptAccommodation[];
  safeStatus: "no_action_needed" | "retry_upload" | "owner_review" | "finalize_attempt";
};

export type StudentSettingsData = {
  notificationPreferences: StudentNotificationPreferences | null;
  accessibilityPreferences: StudentAccessibilityPreferences | null;
  performancePreferences: StudentPerformancePreferences | null;
};

export function rankStudentUrgentActions(attempts: StudentAttemptCard[], nowUtc = new Date().toISOString()): StudentUrgentAction[] {
  const now = Date.parse(nowUtc);
  const actions: StudentUrgentAction[] = [];

  for (const attempt of attempts) {
    if (attempt.state === "ACTIVE") {
      actions.push({ kind: "active_exam", label: "Continue active exam", href: `/student/attempts/${attempt.id}/exam`, priority: 100, attempt });
    }
    if (attempt.failed_upload_count > 0) {
      actions.push({ kind: "failed_upload", label: "Retry failed upload", href: `/student/attempts/${attempt.id}/recovery-status`, priority: 90, attempt });
    }
    const uploadDeadline = attempt.upload_deadline_at_utc ? Date.parse(attempt.upload_deadline_at_utc) : null;
    if (attempt.state === "UPLOAD_ONLY" && uploadDeadline !== null && uploadDeadline >= now && uploadDeadline - now <= 10 * 60 * 1000) {
      actions.push({ kind: "upload_deadline", label: "Upload deadline soon", href: `/student/attempts/${attempt.id}/upload`, priority: 80, attempt });
    }
    if (attempt.needs_finalization) {
      actions.push({ kind: "needs_finalization", label: "Finalize attempt", href: `/student/attempts/${attempt.id}/finalize`, priority: 70, attempt });
    }
    const start = Date.parse(attempt.start_at_utc);
    if (attempt.state === "WAITING" && start >= now && start - now <= 60 * 60 * 1000) {
      actions.push({ kind: "starting_soon", label: "Exam starts soon", href: `/student/attempts/${attempt.id}/readiness`, priority: 60, attempt });
    }
    if (attempt.unread_feedback_count > 0) {
      actions.push({ kind: "feedback_released", label: "Read released feedback", href: `/student/attempts/${attempt.id}/results`, priority: 50, attempt });
    }
    if (attempt.correction_pending) {
      actions.push({ kind: "correction_pending", label: "Complete corrections", href: `/student/attempts/${attempt.id}/corrections`, priority: 40, attempt });
    }
  }

  return actions.sort((a, b) => b.priority - a.priority || Date.parse(a.attempt.start_at_utc) - Date.parse(b.attempt.start_at_utc));
}

export function generateIcsEvent(input: {
  id: string;
  title: string;
  paper_code: string | null;
  start_at_utc: string;
  end_at_utc: string;
  upload_deadline_at_utc: string | null;
  display_timezone: string;
  exam_url: string;
}): string {
  const description = [
    input.paper_code ? `Paper code: ${input.paper_code}` : null,
    `Timezone shown in Exam Vault: ${input.display_timezone}`,
    input.upload_deadline_at_utc ? `Upload deadline: ${input.upload_deadline_at_utc}` : null,
    "Exam timing is based on the Exam Vault server clock.",
    input.exam_url,
  ].filter(Boolean).join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Exam Vault//Student Timeline//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.id)}@exam-vault`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DTSTART:${toIcsUtc(input.start_at_utc)}`,
    `DTEND:${toIcsUtc(input.end_at_utc)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `URL:${input.exam_url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function generateIcsCalendar(attempts: Array<Parameters<typeof generateIcsEvent>[0]>): string {
  const events = attempts.map((attempt) => generateIcsEvent(attempt).split(/\r?\n/).slice(3, -1).join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Exam Vault//Student Timeline//EN", ...events, "END:VCALENDAR"].join("\r\n");
}

export function getAllowedMaterialsForState(materials: StudentMaterial[], state: AttemptState): StudentMaterial[] {
  return materials.filter((material) => {
    if (material.visibility_policy === "owner_only") return false;
    if (material.visibility_policy === "always") return true;
    if (material.visibility_policy === "before_exam") return state === "WAITING";
    if (material.visibility_policy === "active_only") return state === "ACTIVE";
    if (material.visibility_policy === "after_finish") return state === "FINISHED_REVIEW";
    return false;
  });
}

export function buildFinalizationChecklist(input: {
  requireBlankForSkipped: boolean;
  typedResponsesPending: boolean;
  uploadItems: FinalizationUploadItem[];
}): FinalizationChecklist {
  const items = input.uploadItems.map((item): FinalizationChecklistItem => {
    const warningText = item.warnings.length ? ` Warnings: ${item.warnings.join("; ")}` : "";
    if (item.status === "uploaded") {
      const severity = item.sanity_status === "failed" || item.sanity_status === "needs_review" ? "warning" : "ok";
      return { ...item, severity, message: `${item.label} has an uploaded file.${warningText}` };
    }
    if (item.status === "blank_placeholder") {
      return { ...item, severity: "ok", message: `${item.label} was submitted blank.` };
    }
    if (item.status === "queued" || item.status === "uploading" || item.status === "retrying") {
      return { ...item, severity: "blocked", message: `${item.label} is still uploading.` };
    }
    if (item.status === "failed" || item.status === "rejected") {
      return { ...item, severity: "blocked", message: `${item.label} upload failed and must be retried or submitted blank.` };
    }
    if (input.requireBlankForSkipped) {
      return { ...item, severity: "blocked", message: `${item.label} still needs an upload or blank submission.` };
    }
    return { ...item, severity: "warning", message: `${item.label} is missing.` };
  });

  const blockingReasons = items.filter((item) => item.severity === "blocked").map((item) => item.message);
  const warningReasons = items.filter((item) => item.severity === "warning").map((item) => item.message);
  if (input.typedResponsesPending) blockingReasons.push("Typed responses are still saving.");
  return { items, blockingReasons, warningReasons, canFinalize: blockingReasons.length === 0 };
}

export function releasedScorePercent(input: {
  total_awarded_marks: number | null;
  total_available_marks: number | null;
  release_marks?: boolean | null;
}): number | null {
  if (input.release_marks === false) return null;
  if (typeof input.total_awarded_marks !== "number" || !input.total_available_marks) return null;
  return Math.round((input.total_awarded_marks / input.total_available_marks) * 100);
}

export function summarizeStudentProgress(input: {
  attempts: StudentAttemptCard[];
  feedback: StudentFeedbackCard[];
  correctionsSubmitted: number;
  releasedMistakeCounts: Map<string, number>;
  confidenceRatings: number[];
}): StudentProgressSnapshot {
  const completed = input.attempts.filter((attempt) => attempt.state === "FINISHED_REVIEW");
  const releasedScores = input.attempts
    .map((attempt) => attempt.released_score_percent)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  const uploadRates = input.attempts.map((attempt) => attempt.upload_completion_percent).filter((rate) => Number.isFinite(rate));
  const readCount = input.feedback.filter((item) => item.read_at).length;
  const confidenceAverage = input.confidenceRatings.length
    ? Math.round((input.confidenceRatings.reduce((sum, value) => sum + value, 0) / input.confidenceRatings.length) * 10) / 10
    : null;

  return {
    completed_attempts: completed.length,
    average_released_score: releasedScores.length ? Math.round(releasedScores.reduce((sum, score) => sum + score, 0) / releasedScores.length) : null,
    score_groups: buildProgressScoreGroups(input.attempts),
    upload_completion_rate: uploadRates.length ? Math.round(uploadRates.reduce((sum, rate) => sum + rate, 0) / uploadRates.length) : 0,
    feedback_read_rate: input.feedback.length ? Math.round((readCount / input.feedback.length) * 100) : 0,
    corrections_submitted: input.correctionsSubmitted,
    common_mistakes: [...input.releasedMistakeCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    confidence_average: confidenceAverage,
  };
}

export async function getStudentCommandCenterData(studentProfileId: string): Promise<StudentCommandCenterData> {
  const serverNowUtc = new Date().toISOString();
  const attempts = await listStudentAttemptCards(studentProfileId);
  const [feedbackPreview, notifications, receipts, devices, latestDeviceCheck, mistakes, confidenceRatings] = await Promise.all([
    listStudentFeedbackCards(studentProfileId),
    safeStudentRows<StudentNotification>("student_notifications", (supabase) =>
      supabase.from("student_notifications").select("*").eq("student_profile_id", studentProfileId).order("created_at", { ascending: false }).limit(8),
    ),
    safeStudentRows<SubmissionReceipt>("submission_receipts", (supabase) => supabase.from("submission_receipts").select("*").order("created_at", { ascending: false }).limit(5)),
    safeStudentRows<StudentDevice>("student_devices", (supabase) => supabase.from("student_devices").select("*").eq("student_profile_id", studentProfileId).order("last_seen_at", { ascending: false }).limit(5)),
    getLatestStudentDeviceCheck(studentProfileId),
    listReleasedMistakeCounts(),
    listStudentConfidenceRatings(studentProfileId),
  ]);

  return {
    attempts,
    urgentActions: rankStudentUrgentActions(attempts, serverNowUtc).slice(0, 8),
    timeline: [...attempts].sort((a, b) => Date.parse(a.start_at_utc) - Date.parse(b.start_at_utc)),
    feedbackPreview: feedbackPreview.slice(0, 5),
    notifications,
    recentReceipts: receipts,
    devices,
    latestDeviceCheck,
    progress: summarizeStudentProgress({
      attempts,
      feedback: feedbackPreview,
      correctionsSubmitted: attempts.filter((attempt) => attempt.correction_pending === false).length,
      releasedMistakeCounts: mistakes,
      confidenceRatings: confidenceRatings.map((rating) => rating.confidence),
    }),
    serverNowUtc,
  };
}

export async function listStudentAttemptCards(studentProfileId: string): Promise<StudentAttemptCard[]> {
  const attempts = await listStudentAttempts();
  if (isDemoModeEnabled()) {
    return attempts.map((attempt) => ({
      id: attempt.id,
      title: attempt.title,
      paper_code: attempt.paper_code,
      subject: attempt.subject,
      assessment_kind: attempt.assessment_kind,
      state: attempt.state,
      start_at_utc: attempt.start_at_utc,
      end_at_utc: attempt.end_at_utc,
      upload_deadline_at_utc: attempt.upload_deadline_at_utc,
      display_timezone: attempt.display_timezone,
      unread_feedback_count: attempt.id === "att_finished" ? 1 : 0,
      failed_upload_count: 0,
      needs_finalization: attempt.state === "UPLOAD_ONLY",
      correction_pending: attempt.id === "att_finished",
      feedback_released: attempt.id === "att_finished",
      released_score_percent: attempt.id === "att_finished" ? 85 : null,
      upload_completion_percent: attempt.state === "FINISHED_REVIEW" ? 100 : 0,
    }));
  }
  const attemptIds = attempts.map((attempt) => attempt.id);
  if (!attemptIds.length) return [];

  const [slots, releasedResults, reads, sanityChecks, notebooks] = await Promise.all([
    safeStudentRows<UploadSlot>("upload_slots", (supabase) => supabase.from("upload_slots").select("*").in("attempt_id", attemptIds)),
    listReleasedStudentResults(),
    safeStudentRows<StudentFeedbackRead>("student_feedback_reads", (supabase) => supabase.from("student_feedback_reads").select("*").eq("student_profile_id", studentProfileId)),
    safeStudentRows<UploadSanityCheck>("upload_sanity_checks", (supabase) => supabase.from("upload_sanity_checks").select("*")),
    safeStudentRows<{ attempt_id: string; status: string }>("correction_notebooks", (supabase) => supabase.from("correction_notebooks").select("attempt_id,status").eq("student_profile_id", studentProfileId)),
  ]);

  const slotsByAttempt = groupBy(slots, (slot) => slot.attempt_id);
  const feedbackByAttempt = groupBy(releasedResults, (release) => release.attempt_id);
  const readsByRelease = new Map(reads.map((read) => [read.feedback_release_id ?? read.attempt_id, read]));
  const sanityBySlot = latestBy(sanityChecks, (check) => check.upload_slot_id, (check) => check.created_at);
  const notebookByAttempt = new Map(notebooks.map((notebook) => [notebook.attempt_id, notebook]));

  return attempts.map((attempt) => {
    const attemptSlots = slotsByAttempt.get(attempt.id) ?? [];
    const releases = feedbackByAttempt.get(attempt.id) ?? [];
    const unread = releases.filter((release) => !readsByRelease.get(release.feedback_release_id ?? release.attempt_id)?.read_at).length;
    const failedUploadCount = attemptSlots.filter((slot) => {
      const check = sanityBySlot.get(slot.id);
      return slot.status === "rejected" || check?.status === "failed";
    }).length;
    const complete = attemptSlots.filter((slot) => slot.status === "uploaded" || slot.status === "blank_placeholder").length;
    const score = latestResultScore(releases);
    return {
      id: attempt.id,
      title: attempt.title,
      paper_code: attempt.paper_code,
      subject: attempt.subject,
      assessment_kind: attempt.assessment_kind,
      state: attempt.state,
      start_at_utc: attempt.start_at_utc,
      end_at_utc: attempt.end_at_utc,
      upload_deadline_at_utc: attempt.upload_deadline_at_utc,
      display_timezone: attempt.display_timezone,
      unread_feedback_count: unread,
      failed_upload_count: failedUploadCount,
      needs_finalization: attempt.state === "UPLOAD_ONLY" && attemptSlots.some((slot) => slot.status === "pending" || slot.status === "missing" || slot.status === "rejected"),
      correction_pending: ["not_started", "in_progress", "submitted"].includes(String(notebookByAttempt.get(attempt.id)?.status ?? "")),
      feedback_released: releases.length > 0,
      released_score_percent: score,
      upload_completion_percent: attemptSlots.length ? Math.round((complete / attemptSlots.length) * 100) : 100,
    };
  });
}

function buildProgressScoreGroups(attempts: StudentAttemptCard[]): StudentProgressScoreGroup[] {
  const groups = new Map<string, { kind: StudentProgressScoreGroup["kind"]; key: string; label: string; scores: number[] }>();
  for (const attempt of attempts) {
    if (typeof attempt.released_score_percent !== "number" || !Number.isFinite(attempt.released_score_percent)) continue;
    addProgressGroup(groups, "subject", attempt.subject ?? "Uncategorised", attempt.released_score_percent);
    addProgressGroup(groups, "assessment_kind", attempt.assessment_kind ?? "Assessment", attempt.released_score_percent);
    if (attempt.paper_code) addProgressGroup(groups, "paper_code", attempt.paper_code, attempt.released_score_percent);
  }
  return [...groups.values()]
    .map((group) => ({
      kind: group.kind,
      key: group.key,
      label: group.label,
      average_released_score: Math.round(group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length),
      attempt_count: group.scores.length,
    }))
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || b.attempt_count - a.attempt_count || a.label.localeCompare(b.label));
}

function addProgressGroup(
  groups: Map<string, { kind: StudentProgressScoreGroup["kind"]; key: string; label: string; scores: number[] }>,
  kind: StudentProgressScoreGroup["kind"],
  rawLabel: string,
  score: number,
) {
  const label = rawLabel.trim() || "Uncategorised";
  const mapKey = `${kind}:${label}`;
  const existing = groups.get(mapKey);
  if (existing) existing.scores.push(score);
  else groups.set(mapKey, { kind, key: label, label, scores: [score] });
}

function kindOrder(kind: StudentProgressScoreGroup["kind"]): number {
  if (kind === "subject") return 0;
  if (kind === "assessment_kind") return 1;
  return 2;
}

export async function listStudentFeedbackCards(studentProfileId: string): Promise<StudentFeedbackCard[]> {
  if (isDemoModeEnabled()) {
    return [
      {
        attempt_id: "att_finished",
        feedback_release_id: "feedback_demo",
        title: "IB-style Physics Paper 2",
        paper_code: "PHY-P2",
        released_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        read_at: null,
        marks_released: true,
        comments_released: true,
        annotated_pdf_available: true,
        corrections_required: true,
      },
    ];
  }
  const attempts = await listStudentAttempts();
  const attemptIds = attempts.map((attempt) => attempt.id);
  if (!attemptIds.length) return [];
  const [releases, reads, slots, notebooks] = await Promise.all([
    listReleasedStudentResults(),
    safeStudentRows<StudentFeedbackRead>("student_feedback_reads", (supabase) => supabase.from("student_feedback_reads").select("*").eq("student_profile_id", studentProfileId)),
    safeStudentRows<UploadSlot>("upload_slots", (supabase) => supabase.from("upload_slots").select("*").in("attempt_id", attemptIds)),
    safeStudentRows<{ attempt_id: string; status: string }>("correction_notebooks", (supabase) => supabase.from("correction_notebooks").select("attempt_id,status").eq("student_profile_id", studentProfileId)),
  ]);
  const readByRelease = new Map(reads.map((read) => [read.feedback_release_id ?? read.attempt_id, read]));
  const slotsByAttempt = groupBy(slots, (slot) => slot.attempt_id);
  const notebookByAttempt = new Map(notebooks.map((notebook) => [notebook.attempt_id, notebook]));
  return releases
    .filter((release) => attemptIds.includes(release.attempt_id))
    .sort((a, b) => b.released_at.localeCompare(a.released_at))
    .map((release) => ({
      attempt_id: release.attempt_id,
      feedback_release_id: release.feedback_release_id ?? null,
      title: release.assessment_title,
      paper_code: release.paper_code,
      released_at: release.released_at,
      read_at: readByRelease.get(release.feedback_release_id ?? release.attempt_id)?.read_at ?? readByRelease.get(release.attempt_id)?.read_at ?? null,
      marks_released: release.release_marks !== false,
      comments_released: release.release_comments !== false,
      annotated_pdf_available: release.release_annotated_pdfs !== false && (slotsByAttempt.get(release.attempt_id) ?? []).some((slot) => Boolean(slot.annotated_object_path)),
      corrections_required: ["not_started", "in_progress"].includes(String(notebookByAttempt.get(release.attempt_id)?.status ?? "")),
    }));
}

export async function getStudentTimelineData(studentProfileId: string) {
  const attempts = await listStudentAttemptCards(studentProfileId);
  return [...attempts].sort((a, b) => Date.parse(a.start_at_utc) - Date.parse(b.start_at_utc));
}

export async function getStudentSettingsData(studentProfileId: string): Promise<StudentSettingsData> {
  const [notificationPreferences, accessibilityPreferences, performancePreferences] = await Promise.all([
    safeSingle<StudentNotificationPreferences>("student_notification_preferences", (supabase) => supabase.from("student_notification_preferences").select("*").eq("student_profile_id", studentProfileId).maybeSingle()),
    safeSingle<StudentAccessibilityPreferences>("student_accessibility_preferences", (supabase) => supabase.from("student_accessibility_preferences").select("*").eq("student_profile_id", studentProfileId).maybeSingle()),
    safeSingle<StudentPerformancePreferences>("student_performance_preferences", (supabase) => supabase.from("student_performance_preferences").select("*").eq("student_profile_id", studentProfileId).maybeSingle()),
  ]);
  return { notificationPreferences, accessibilityPreferences, performancePreferences };
}

export async function getStudentDevicesData(studentProfileId: string) {
  const [devices, checks] = await Promise.all([
    safeStudentRows<StudentDevice>("student_devices", (supabase) => supabase.from("student_devices").select("*").eq("student_profile_id", studentProfileId).order("last_seen_at", { ascending: false })),
    safeStudentRows<StudentDeviceCheck>("student_device_checks", (supabase) => supabase.from("student_device_checks").select("*").eq("student_profile_id", studentProfileId).order("created_at", { ascending: false }).limit(20)),
  ]);
  return { devices, checks };
}

export async function getStudentReadinessData(studentProfileId: string, attemptId: string): Promise<StudentReadinessData> {
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    const attempts = await listStudentAttemptCards(studentProfileId);
    return {
      attempt: attempts.find((attempt) => attempt.id === attemptId) ?? null,
      latestCheck: {
        id: "check_demo",
        student_profile_id: studentProfileId,
        device_id_hash: "demo-hash",
        attempt_id: attemptId,
        status: "passed",
        checks_json: {},
        warnings_json: [],
        created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      } as any,
      serverNowUtc: new Date().toISOString(),
    };
  }
  const attempts = await listStudentAttemptCards(studentProfileId);
  const latestCheck = await safeSingle<StudentDeviceCheck>("student_device_checks", (supabase) =>
    supabase.from("student_device_checks").select("*").eq("student_profile_id", studentProfileId).eq("attempt_id", attemptId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  );
  return {
    attempt: attempts.find((attempt) => attempt.id === attemptId) ?? null,
    latestCheck,
    serverNowUtc: new Date().toISOString(),
  };
}

export async function getStudentFinalizeData(studentProfileId: string, attemptId: string): Promise<StudentFinalizeData> {
  const attempts = await listStudentAttemptCards(studentProfileId);
  const attempt = attempts.find((item) => item.id === attemptId) ?? null;
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    const uploadItems: FinalizationUploadItem[] = [
      {
        slot_id: "slot_demo_1",
        label: "Q1",
        status: "uploaded",
        file_name: "physics_paper2_q1.pdf",
        sanity_status: "accepted",
        warnings: [],
      },
      {
        slot_id: "slot_demo_2",
        label: "Q2",
        status: "blank_placeholder",
        file_name: null,
        sanity_status: null,
        warnings: [],
      },
    ];
    return {
      attempt,
      uploadItems,
      checklist: buildFinalizationChecklist({
        requireBlankForSkipped: true,
        typedResponsesPending: false,
        uploadItems,
      }),
    };
  }
  const [slots, sanityChecks, queueEvents] = await Promise.all([
    safeStudentRows<UploadSlot>("upload_slots", (supabase) => supabase.from("upload_slots").select("*").eq("attempt_id", attemptId).order("created_at")),
    safeStudentRows<UploadSanityCheck>("upload_sanity_checks", (supabase) => supabase.from("upload_sanity_checks").select("*").order("created_at", { ascending: false })),
    safeStudentRows<UploadQueueEvent>("upload_queue_events", (supabase) => supabase.from("upload_queue_events").select("*").eq("student_profile_id", studentProfileId).order("created_at", { ascending: false })),
  ]);
  const queueBySlot = latestBy(queueEvents, (event) => event.upload_slot_id, (event) => event.created_at);
  const sanityBySlot = latestBy(sanityChecks, (check) => check.upload_slot_id, (check) => check.created_at);
  const uploadItems = slots.map((slot) => uploadItemFromSlot(slot, sanityBySlot.get(slot.id) ?? null, queueBySlot.get(slot.id) ?? null));
  return {
    attempt,
    uploadItems,
    checklist: buildFinalizationChecklist({
      requireBlankForSkipped: true,
      typedResponsesPending: false,
      uploadItems,
    }),
  };
}

export async function getStudentRecoveryStatusData(studentProfileId: string, attemptId: string): Promise<StudentRecoveryStatusData> {
  const attempts = await listStudentAttemptCards(studentProfileId);
  const attempt = attempts.find((item) => item.id === attemptId) ?? null;
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    return {
      attempt,
      slots: [
        {
          id: "slot_demo_1",
          attempt_id: attemptId,
          question_node_id: "q1",
          required: true,
          object_path: "demo/q1.pdf",
          original_file_name: "q1.pdf",
          uploaded_at: new Date(Date.now() - 600 * 1000).toISOString(),
          file_size_bytes: 1024 * 1024,
          content_type: "application/pdf",
          confirmed_by_profile_id: studentProfileId,
          locked_at: new Date(Date.now() - 600 * 1000).toISOString(),
          annotated_object_path: null,
          annotated_generated_at: null,
          is_blank_placeholder: false,
          status: "uploaded",
          created_at: new Date(Date.now() - 1200 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 600 * 1000).toISOString(),
        },
      ],
      queueEvents: [],
      incidents: [
        {
          id: "incident_demo",
          attempt_id: attemptId,
          student_profile_id: studentProfileId,
          incident_type: "internet_issue",
          description: "Slight delay in saving responses",
          severity: "low",
          status: "submitted",
          resolved_at: null,
          created_at: new Date(Date.now() - 300 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 300 * 1000).toISOString(),
        } as any,
      ],
      accommodations: [],
      safeStatus: "no_action_needed",
    };
  }
  const [slots, queueEvents, incidents, accommodations] = await Promise.all([
    safeStudentRows<UploadSlot>("upload_slots", (supabase) => supabase.from("upload_slots").select("*").eq("attempt_id", attemptId).order("created_at")),
    safeStudentRows<UploadQueueEvent>("upload_queue_events", (supabase) => supabase.from("upload_queue_events").select("*").eq("student_profile_id", studentProfileId).order("created_at", { ascending: false })),
    safeStudentRows<StudentIncidentReport>("student_incident_reports", (supabase) => supabase.from("student_incident_reports").select("*").eq("attempt_id", attemptId).eq("student_profile_id", studentProfileId).order("created_at", { ascending: false })),
    safeStudentRows<AttemptAccommodation>("attempt_accommodations", (supabase) => supabase.from("attempt_accommodations").select("*").eq("attempt_id", attemptId).order("applied_at", { ascending: false })),
  ]);
  const hasFailed = slots.some((slot) => slot.status === "rejected");
  const hasPendingIncident = incidents.some((incident) => incident.status === "submitted" || incident.status === "reviewed");
  const safeStatus = hasFailed ? "retry_upload" : hasPendingIncident ? "owner_review" : attempt?.needs_finalization ? "finalize_attempt" : "no_action_needed";
  return { attempt, slots, queueEvents, incidents, accommodations, safeStatus };
}

export async function getStudentMaterialsForAttempt(attemptId: string): Promise<StudentMaterial[]> {
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    return [
      {
        id: "mat_demo_1",
        title: "IB Physics Formula Booklet",
        material_type: "formula_booklet",
        visibility_policy: "always",
        object_path: null,
        content_html: "<p>Standard formula sheet content for physics simulation.</p>",
        signed_url: null,
      },
    ];
  }
  const attempt = await safeSingle<Attempt>("attempts", (supabase) => supabase.from("attempts").select("*").eq("id", attemptId).maybeSingle());
  if (!attempt) return [];
  const serverNowUtc = new Date().toISOString();
  const state = computeAttemptState({
    serverNowUtc,
    startAtUtc: attempt.start_at_utc,
    endAtUtc: attempt.end_at_utc,
    uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
    solutionsRequested: attempt.solutions_requested,
  });
  const materials = await safeStudentRows<AssessmentMaterial>("assessment_materials", (supabase) =>
    supabase.from("assessment_materials").select("*").eq("assessment_id", attempt.assessment_id).eq("assessment_version_id", attempt.assessment_version_id).order("created_at"),
  );
  const allowed = getAllowedMaterialsForState(materials, state);
  const supabase = await createSupabaseServerClient();
  return Promise.all(
    allowed.map(async (material) => {
      if (!material.object_path) return { ...material, signed_url: null };
      const { data } = await supabase.storage.from("assessment-sources").createSignedUrl(material.object_path, 600);
      return { ...material, signed_url: data?.signedUrl ?? null };
    }),
  );
}

export async function listReleasedMistakeCounts(): Promise<Map<string, number>> {
  const [instances, categories] = await Promise.all([
    safeStudentRows<MistakeInstance>("mistake_instances", (supabase) => supabase.from("mistake_instances").select("*").eq("student_visible", true)),
    safeStudentRows<MistakeCategory>("mistake_categories", (supabase) => supabase.from("mistake_categories").select("*")),
  ]);
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const counts = new Map<string, number>();
  for (const instance of instances) {
    const label = categoryById.get(instance.category_id) ?? "Released mistake";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

export async function listStudentConfidenceRatings(studentProfileId: string): Promise<StudentConfidenceRating[]> {
  return safeStudentRows<StudentConfidenceRating>("student_confidence_ratings", (supabase) =>
    supabase.from("student_confidence_ratings").select("*").eq("student_profile_id", studentProfileId).order("updated_at", { ascending: false }),
  );
}

function uploadItemFromSlot(slot: UploadSlot, sanity: UploadSanityCheck | null, queue: UploadQueueEvent | null): FinalizationUploadItem {
  const eventType = queue?.event_type ?? "";
  const queuedState = ["queued", "uploading", "failed", "retrying", "expired"].includes(eventType)
    ? (eventType as FinalizationUploadItem["status"])
    : null;
  return {
    slot_id: slot.id,
    label: `Q${slot.question_node_id.slice(0, 8)}`,
    status: queuedState ?? slot.status,
    file_name: slot.original_file_name,
    sanity_status: sanity?.status ?? null,
    warnings: Array.isArray(sanity?.warnings_json) ? sanity.warnings_json.map((warning) => warningToText(warning)) : [],
  };
}

function latestResultScore(releases: StudentResultRelease[]): number | null {
  const latest = [...releases].sort((a, b) => b.released_at.localeCompare(a.released_at))[0];
  return latest ? releasedScorePercent(latest) : null;
}

async function listReleasedStudentResults(): Promise<StudentResultRelease[]> {
  try {
    const response = await invokeEdgeFunctionServer<StudentResultsListResponse>("list-student-results", {});
    return response.results ?? [];
  } catch (error) {
    if (isMissingOptionalTableError(error)) return [];
    throw error;
  }
}

async function getLatestStudentDeviceCheck(studentProfileId: string): Promise<StudentDeviceCheck | null> {
  return safeSingle<StudentDeviceCheck>("student_device_checks", (supabase) =>
    supabase.from("student_device_checks").select("*").eq("student_profile_id", studentProfileId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  );
}

async function safeStudentRows<T>(
  _label: string,
  queryFactory: (supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await queryFactory(supabase);
    if (error) throw error;
    return Array.isArray(data) ? (data as T[]) : [];
  } catch (error) {
    if (isMissingOptionalTableError(error)) return [];
    throw error;
  }
}

async function safeSingle<T>(
  _label: string,
  queryFactory: (supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await queryFactory(supabase);
    if (error) throw error;
    return (data as T | null) ?? null;
  } catch (error) {
    if (isMissingOptionalTableError(error)) return null;
    throw error;
  }
}

function isMissingOptionalTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return /does not exist|Could not find the table|schema cache/i.test(message);
}

function groupBy<T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function latestBy<T, K>(items: T[], getKey: (item: T) => K, getDate: (item: T) => string): Map<K, T> {
  const latest = new Map<K, T>();
  for (const item of items) {
    const key = getKey(item);
    const previous = latest.get(key);
    if (!previous || getDate(item).localeCompare(getDate(previous)) > 0) latest.set(key, item);
  }
  return latest;
}

function warningToText(warning: Json): string {
  if (warning && typeof warning === "object" && !Array.isArray(warning) && "message" in warning) {
    const value = warning.message;
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return typeof warning === "string" ? warning : JSON.stringify(warning);
}

function toIcsUtc(utcIso: string): string {
  return new Date(utcIso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
