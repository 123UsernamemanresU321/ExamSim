"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateReadableExamCode, hashExamSecret, normalizeExamCode } from "@/lib/examsim/guest-access";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateSebPublishKeys } from "@/lib/seb";

export async function createExamSessionAction(formData: FormData) {
  const { ownerProfileId } = await requireInstitutionPermission("session_publishing");
  const supabase = await createSupabaseServerClient();
  const selection = String(formData.get("assessment_version_selection") ?? "");
  const [selectedAssessmentId, selectedVersionId] = selection.split("|");
  const assessmentId = selectedAssessmentId || requiredString(formData, "assessment_id");
  const versionId = selectedVersionId || requiredString(formData, "assessment_version_id");
  const title = requiredString(formData, "title");
  const generatedCode = normalizeExamCode(String(formData.get("code") ?? "")) || generateReadableExamCode(title.slice(0, 5) || "EXAM");
  const displayTimezone = String(formData.get("display_timezone") ?? "Africa/Johannesburg");
  const startAt = parseLocalTimeToUtc(requiredString(formData, "start_at_utc"), displayTimezone).toISOString();
  const openAt = parseLocalTimeToUtc(String(formData.get("open_at_utc") || formData.get("start_at_utc")), displayTimezone).toISOString();
  const durationSeconds = Math.max(60, Number(formData.get("duration_minutes") ?? 90) * 60);
  const uploadGraceMinutes = Math.max(0, Number(formData.get("upload_grace_minutes") ?? 15));
  const closeAt = new Date(Date.parse(startAt) + (durationSeconds + uploadGraceMinutes * 60) * 1000).toISOString();
  const uploadDeadlineAt = uploadGraceMinutes ? new Date(Date.parse(startAt) + (durationSeconds + uploadGraceMinutes * 60) * 1000).toISOString() : null;
  const restBreakMaxMinutes = boundedInteger(formData.get("rest_break_max_minutes"), 1, 240, 15);
  const fontScale = boundedInteger(formData.get("font_scale_percent"), 100, 150, 100);

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id,owner_profile_id,title")
    .eq("id", assessmentId)
    .single();
  if (assessmentError) throw assessmentError;
  if (assessment.owner_profile_id !== ownerProfileId) throw new Error("Forbidden assessment");
  const { data: version, error: versionError } = await supabase
    .from("assessment_versions")
    .select("id,status,governance_status,assessment_id")
    .eq("id", versionId)
    .eq("assessment_id", assessmentId)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version || version.status !== "published" || version.governance_status !== "published") {
    throw new Error("Exam sessions require a published assessment version.");
  }

  const [{ data: optionalTools, error: toolPolicyError }, { data: optionalResources, error: resourcePolicyError }] = await Promise.all([
    supabase.from("assessment_tool_policies").select("tool_code,requirement").eq("assessment_version_id", versionId).eq("requirement", "allowed"),
    supabase.from("assessment_materials").select("id,requirement").eq("assessment_version_id", versionId).eq("requirement", "allowed"),
  ]);
  if (toolPolicyError) throw toolPolicyError;
  if (resourcePolicyError) throw resourcePolicyError;
  const toolRequirements = Object.fromEntries((optionalTools ?? [])
    .filter((tool) => formData.get(`prohibit_tool_${tool.tool_code}`) === "on")
    .map((tool) => [tool.tool_code, "prohibited"]));
  const resourceRequirements = Object.fromEntries((optionalResources ?? [])
    .filter((resource) => formData.get(`prohibit_resource_${resource.id}`) === "on")
    .map((resource) => [resource.id, "prohibited"]));

  const modeValue = String(formData.get("mode") ?? "timed");
  const mode = ["practice", "timed", "controlled", "seb_required"].includes(modeValue)
    ? modeValue as "practice" | "timed" | "controlled" | "seb_required"
    : "timed";
  const sebBrowserExamKeys = splitHashList(formData.get("seb_browser_exam_key_hashes"));
  const sebConfigKeys = splitHashList(formData.get("seb_config_key_hashes"));
  const sebValidation = validateSebPublishKeys({ deliveryMode: mode === "seb_required" ? "seb_required" : "browser", browserExamKeys: sebBrowserExamKeys, configKeys: sebConfigKeys });
  if (!sebValidation.ok) throw new Error(sebValidation.reason);

  const { data: session, error } = await supabase
    .from("exam_sessions")
    .insert({
      owner_profile_id: ownerProfileId,
      assessment_id: assessmentId,
      assessment_version_id: versionId,
      title,
      status: "published",
      mode,
      code_hash: await hashExamSecret(generatedCode),
      code_display_hint: generatedCode.split("-").slice(-1)[0] ?? null,
      code_rotated_at: new Date().toISOString(),
      open_at_utc: openAt,
      start_at_utc: startAt,
      close_at_utc: closeAt,
      duration_seconds: durationSeconds,
      upload_deadline_at_utc: uploadDeadlineAt,
      display_timezone: String(formData.get("display_timezone") ?? "Africa/Johannesburg"),
      attempt_limit_per_student: Math.max(1, Number(formData.get("attempt_limit_per_student") ?? 1)),
      identity_policy_json: {
        student_name: formData.get("require_student_name") === "on",
        student_number: formData.get("require_student_number") === "on",
        class_group: true,
        date: true,
        roster_first: true,
        require_roster_match: formData.get("require_roster_match") === "on",
        allow_unregistered_guests: formData.get("allow_unregistered_guests") === "on",
      },
      security_settings_json: {
        seb_browser_exam_key_hashes: sebBrowserExamKeys,
        seb_config_key_hashes: sebConfigKeys,
      },
      settings_json: {
        exam_policy_overrides: {
          tool_requirements: toolRequirements,
          resource_requirements: resourceRequirements,
        },
        accommodations: {
          rest_break_allowed: formData.get("rest_break_allowed") === "on",
          rest_break_max_minutes: restBreakMaxMinutes,
          font_scale_percent: [100, 125, 150].includes(fontScale) ? fontScale : 100,
          dyslexia_font: formData.get("dyslexia_font") === "on",
          contrast_mode: formData.get("contrast_mode") === "high" ? "high" : "standard",
        },
      },
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/owner/exam-sessions");
  redirect(`/owner/exam-sessions/${session.id}?new_code=${encodeURIComponent(generatedCode)}`);
}

export async function rotateExamSessionCodeAction(sessionId: string) {
  const { ownerProfileId } = await requireInstitutionPermission("session_publishing");
  const supabase = await createSupabaseServerClient();
  const code = generateReadableExamCode("EXAM");
  const { error } = await supabase
    .from("exam_sessions")
    .update({
      code_hash: await hashExamSecret(code),
      code_display_hint: code.split("-").slice(-1)[0] ?? null,
      code_rotated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("owner_profile_id", ownerProfileId);
  if (error) throw error;
  revalidatePath(`/owner/exam-sessions/${sessionId}`);
  redirect(`/owner/exam-sessions/${sessionId}?new_code=${encodeURIComponent(code)}`);
}

export async function updateExamSessionStatusAction(sessionId: string, status: "published" | "live" | "closed" | "marking" | "returned" | "archived") {
  const { ownerProfileId } = await requireInstitutionPermission("session_publishing");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("exam_sessions")
    .update({
      status,
      closed_at: status === "closed" ? new Date().toISOString() : null,
    })
    .eq("id", sessionId)
    .eq("owner_profile_id", ownerProfileId);
  if (error) throw error;
  revalidatePath("/owner/exam-sessions");
  revalidatePath(`/owner/exam-sessions/${sessionId}`);
}

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}



function parseLocalTimeToUtc(localTime: string, timezone: string): Date {
  const localDate = new Date(localTime + ":00Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(localDate);
  const offsetPart = parts.find((p) => p.type === "timeZoneName");
  if (!offsetPart) return localDate;
  const match = offsetPart.value.match(/GMT([+-])(\d+):?(\d+)?/);
  if (!match) return localDate;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  const offsetMinutes = sign * (hours * 60 + minutes);
  return new Date(localDate.getTime() - offsetMinutes * 60 * 1000);
}

function boundedInteger(value: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function splitHashList(value: FormDataEntryValue | null) {
  return [...new Set(String(value ?? "").split(/[\s,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}
