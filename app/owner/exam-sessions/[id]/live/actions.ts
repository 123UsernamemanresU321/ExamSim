"use server";

import { revalidatePath } from "next/cache";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export async function sendSessionBroadcastAction(sessionId: string, formData: FormData) {
  const { ownerProfileId, profileId } = await requireInstitutionPermission("invigilation");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) throw new Error("Message is required");
  const supabase = await createSupabaseServerClient();
  await requireOwnedSession(supabase, sessionId, ownerProfileId);
  const { error } = await supabase.from("invigilation_messages").insert({
    exam_session_id: sessionId,
    sender_profile_id: profileId,
    sender_kind: "owner",
    message_kind: "broadcast",
    body,
    visible_to_student: true,
  });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "invigilation.broadcast.sent", targetTable: "exam_sessions", targetId: sessionId });
  revalidatePath(`/owner/exam-sessions/${sessionId}/live`);
}

export async function sendPrivateInvigilationMessageAction(sessionId: string, attemptId: string, formData: FormData) {
  const { ownerProfileId, profileId } = await requireInstitutionPermission("invigilation");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) throw new Error("Message is required");
  const supabase = await createSupabaseServerClient();
  await requireOwnedSession(supabase, sessionId, ownerProfileId);
  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .select("id")
    .eq("id", attemptId)
    .eq("exam_session_id", sessionId)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt?.id) throw new Error("Attempt does not belong to this exam session.");

  const { error } = await supabase.from("invigilation_messages").insert({
    exam_session_id: sessionId,
    attempt_id: attemptId,
    sender_profile_id: profileId,
    sender_kind: "owner",
    message_kind: "private",
    body,
    visible_to_student: true,
  });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "invigilation.private_message.sent", targetTable: "attempts", targetId: attemptId, metadata: { exam_session_id: sessionId } });
  revalidatePath(`/owner/exam-sessions/${sessionId}/live`);
}

export async function applyLiveInterventionAction(
  sessionId: string,
  attemptId: string,
  actionType: "extra_time" | "pause" | "resume" | "force_submit" | "technical_issue",
  formData?: FormData,
) {
  const { ownerProfileId } = await requireInstitutionPermission("invigilation");
  const supabase = await createSupabaseServerClient();
  await requireOwnedSession(supabase, sessionId, ownerProfileId);

  let details: Record<string, unknown> = {};
  if (actionType === "extra_time") {
    const extraSeconds = validateExtraTimeSeconds(formData?.get("extra_seconds"));
    const { data, error: timingError } = await supabase.rpc("institution_apply_timing_intervention", {
      p_owner_profile_id: ownerProfileId,
      p_attempt_id: attemptId,
      p_exam_session_id: sessionId,
      p_action: "extra_time",
      p_extra_seconds: extraSeconds,
    });
    if (timingError) throw timingError;
    details = typeof data === "object" && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : { extra_seconds: extraSeconds };
  }
  if (actionType === "pause") {
    const reason = String(formData?.get("reason") ?? "Approved rest break").trim();
    const { data: pauseData, error: pauseError } = await supabase.rpc("institution_start_attempt_rest_break", {
      p_owner_profile_id: ownerProfileId,
      p_attempt_id: attemptId,
      p_exam_session_id: sessionId,
      p_reason: reason,
      p_maximum_seconds: 7200,
    });
    if (pauseError) throw pauseError;
    details = { reason, pause_interval_id: pauseData?.[0]?.pause_interval_id ?? null };
  }
  if (actionType === "resume") {
    const { data: resumeData, error: resumeError } = await supabase.rpc("institution_resume_attempt_rest_break", {
      p_owner_profile_id: ownerProfileId,
      p_attempt_id: attemptId,
      p_exam_session_id: sessionId,
    });
    if (resumeError) throw resumeError;
    details = {
      pause_interval_id: resumeData?.[0]?.pause_interval_id ?? null,
      applied_seconds: resumeData?.[0]?.applied_seconds ?? null,
      new_end_at_utc: resumeData?.[0]?.new_end_at_utc ?? null,
      new_upload_deadline_at_utc: resumeData?.[0]?.new_upload_deadline_at_utc ?? null,
    };
  }
  if (actionType === "force_submit") {
    const { data, error: forceError } = await supabase.rpc("institution_apply_timing_intervention", {
      p_owner_profile_id: ownerProfileId,
      p_attempt_id: attemptId,
      p_exam_session_id: sessionId,
      p_action: "force_submit",
      p_extra_seconds: null,
    });
    if (forceError) throw forceError;
    details = typeof data === "object" && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {};
  }
  const { error } = await supabase.from("live_interventions").insert({
    exam_session_id: sessionId,
    attempt_id: attemptId,
    owner_profile_id: ownerProfileId,
    action_type: actionType,
    details_json: details as Json,
  });
  if (error) throw error;
  await auditInstitutionAction({
    ownerProfileId,
    action: `live_intervention.${actionType}`,
    targetTable: "attempts",
    targetId: attemptId,
    metadata: {
      exam_session_id: sessionId,
      action_type: actionType,
      ...details,
    },
  });
  revalidatePath(`/owner/exam-sessions/${sessionId}/live`);
}

function validateExtraTimeSeconds(value: FormDataEntryValue | null | undefined) {
  const raw = value == null || value === "" ? "600" : String(value);
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 7200) {
    throw new Error("Extra time must be between 1 and 120 minutes.");
  }
  return seconds;
}

async function requireOwnedSession(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sessionId: string,
  ownerProfileId: string,
) {
  const { data, error } = await supabase
    .from("exam_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("owner_profile_id", ownerProfileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Exam session not found in this institution.");
}
