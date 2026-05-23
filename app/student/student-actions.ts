"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const STUDENT_INCIDENT_TYPES = new Set([
  "internet_issue",
  "power_cut",
  "browser_crash",
  "upload_problem",
  "wrong_file_uploaded",
  "scanner_camera_issue",
  "medical_issue",
  "other",
]);

export async function recordReadinessCheck(attemptId: string, checks: Record<string, unknown>, status: "passed" | "warning" | "failed") {
  const profile = await requireAppRole("student", `/student/attempts/${attemptId}/readiness`);
  const supabase = await createSupabaseServerClient();
  await supabase.from("student_device_checks").insert({
    student_profile_id: profile?.id ?? "",
    attempt_id: attemptId,
    device_id_hash: hashStable(String(checks.device_id ?? checks.user_agent ?? "device")),
    user_agent_hash: hashStable(String(checks.user_agent ?? "")),
    checks_json: checks as Json,
    status,
  });
  revalidatePath(`/student/attempts/${attemptId}/readiness`);
}

export async function submitStudentIncidentReport(attemptId: string, formData: FormData) {
  const profile = await requireAppRole("student", `/student/attempts/${attemptId}/recovery-status`);
  const incidentTypeRaw = String(formData.get("incident_type") ?? "other");
  const incidentType = STUDENT_INCIDENT_TYPES.has(incidentTypeRaw) ? incidentTypeRaw : "other";
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("student_incident_reports").insert({
    attempt_id: attemptId,
    student_profile_id: profile?.id ?? "",
    incident_type: incidentType as "internet_issue" | "power_cut" | "browser_crash" | "upload_problem" | "wrong_file_uploaded" | "scanner_camera_issue" | "medical_issue" | "other",
    description,
    payload_json: {
      reported_from: String(formData.get("reported_from") ?? "student"),
      client_note: "Student-submitted incident report.",
    },
  });
  revalidatePath(`/student/attempts/${attemptId}/recovery-status`);
}

export async function saveStudentConfidenceRating(attemptId: string, questionNodeId: string, formData: FormData) {
  const profile = await requireAppRole("student", `/student/attempts/${attemptId}/compare/${questionNodeId}`);
  const confidence = Number(formData.get("confidence") ?? 0);
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) return;
  const note = String(formData.get("note") ?? "").trim() || null;
  const supabase = await createSupabaseServerClient();
  await supabase.from("student_confidence_ratings").upsert(
    {
      student_profile_id: profile?.id ?? "",
      attempt_id: attemptId,
      question_node_id: questionNodeId,
      confidence,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_profile_id,attempt_id,question_node_id" },
  );
  revalidatePath(`/student/attempts/${attemptId}/compare/${questionNodeId}`);
}

export async function markStudentFeedbackRead(attemptId: string, feedbackReleaseId: string | null) {
  const profile = await requireAppRole("student", `/student/attempts/${attemptId}/results`);
  const supabase = await createSupabaseServerClient();
  await supabase.from("student_feedback_reads").upsert(
    {
      student_profile_id: profile?.id ?? "",
      attempt_id: attemptId,
      feedback_release_id: feedbackReleaseId,
      read_at: new Date().toISOString(),
    },
    { onConflict: "student_profile_id,attempt_id,feedback_release_id" },
  );
  revalidatePath("/student/feedback");
}

export async function saveNotificationPreferences(formData: FormData) {
  const profile = await requireAppRole("student", "/student/notification-settings");
  const supabase = await createSupabaseServerClient();
  await supabase.from("student_notification_preferences").upsert(
    {
      student_profile_id: profile?.id ?? "",
      exam_24h: formData.get("exam_24h") === "on",
      exam_1h: formData.get("exam_1h") === "on",
      exam_10m: formData.get("exam_10m") === "on",
      upload_deadline_10m: formData.get("upload_deadline_10m") === "on",
      feedback_released: formData.get("feedback_released") === "on",
      correction_reviewed: formData.get("correction_reviewed") === "on",
      browser_notifications_enabled: formData.get("browser_notifications_enabled") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_profile_id" },
  );
  revalidatePath("/student/notification-settings");
}

export async function saveAccessibilityPreferences(formData: FormData) {
  const profile = await requireAppRole("student", "/student/accessibility");
  const supabase = await createSupabaseServerClient();
  const preferences = {
    interface_font_size: String(formData.get("interface_font_size") ?? "normal"),
    question_font_size: String(formData.get("question_font_size") ?? "normal"),
    line_spacing: String(formData.get("line_spacing") ?? "normal"),
    high_contrast: formData.get("high_contrast") === "on",
    reduced_motion: formData.get("reduced_motion") === "on",
    timer_display_mode: String(formData.get("timer_display_mode") ?? "full"),
  };
  await supabase.from("student_accessibility_preferences").upsert(
    { student_profile_id: profile?.id ?? "", preferences_json: preferences, updated_at: new Date().toISOString() },
    { onConflict: "student_profile_id" },
  );
  await supabase.from("student_performance_preferences").upsert(
    { student_profile_id: profile?.id ?? "", low_bandwidth_mode: formData.get("low_bandwidth_mode") === "on", updated_at: new Date().toISOString() },
    { onConflict: "student_profile_id" },
  );
  revalidatePath("/student/accessibility");
}

export async function generateStudentRecoveryCode(): Promise<{ code: string | null; error: string | null }> {
  const profile = await requireAppRole("student", "/student/security");
  const code = randomBytes(8).toString("hex").toUpperCase();
  const supabase = await createSupabaseServerClient();
  await supabase.from("student_recovery_codes").update({ used_at: new Date().toISOString() }).eq("student_profile_id", profile?.id ?? "").is("used_at", null);
  const { error } = await supabase.from("student_recovery_codes").insert({
    student_profile_id: profile?.id ?? "",
    code_hash: hashStable(code),
  });
  if (error) return { code: null, error: "Could not generate a recovery code." };
  return { code, error: null };
}

function hashStable(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
