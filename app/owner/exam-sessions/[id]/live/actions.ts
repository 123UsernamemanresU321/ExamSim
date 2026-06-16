"use server";

import { revalidatePath } from "next/cache";
import { computeAttemptState } from "@/lib/attempt-state";
import { requireOwnerProfileId } from "@/lib/examsim/session-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Attempt, Json } from "@/types/database";

export async function sendSessionBroadcastAction(sessionId: string, formData: FormData) {
  const ownerProfileId = await requireOwnerProfileId();
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) throw new Error("Message is required");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("invigilation_messages").insert({
    exam_session_id: sessionId,
    sender_profile_id: ownerProfileId,
    sender_kind: "owner",
    message_kind: "broadcast",
    body,
    visible_to_student: true,
  });
  if (error) throw error;
  revalidatePath(`/owner/exam-sessions/${sessionId}/live`);
}

export async function applyLiveInterventionAction(
  sessionId: string,
  attemptId: string,
  actionType: "extra_time" | "pause" | "resume" | "force_submit" | "technical_issue",
  formData?: FormData,
) {
  const ownerProfileId = await requireOwnerProfileId();
  const supabase = await createSupabaseServerClient();
  const { data: attemptRow, error: attemptError } = await supabase
    .from("attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("exam_session_id", sessionId)
    .single();
  if (attemptError) throw attemptError;
  const attempt = attemptRow as Attempt;
  const state = computeAttemptState({
    serverNowUtc: new Date().toISOString(),
    startAtUtc: attempt.start_at_utc,
    endAtUtc: attempt.end_at_utc,
    uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
    solutionsRequested: attempt.solutions_requested,
  });
  if (state === "FINISHED_REVIEW" || attempt.forced_submitted_at) {
    throw new Error("Finalized or submitted attempts cannot receive live interventions.");
  }

  let details: Record<string, unknown> = {};
  if (actionType === "extra_time") {
    const extraSeconds = validateExtraTimeSeconds(formData?.get("extra_seconds"));
    const previousEndAtUtc = attempt.end_at_utc;
    const previousUploadDeadlineAtUtc = attempt.upload_deadline_at_utc;
    const nextEndAtUtc = new Date(Date.parse(attempt.end_at_utc) + extraSeconds * 1000).toISOString();
    const nextUploadDeadlineAtUtc = attempt.upload_deadline_at_utc
      ? new Date(Date.parse(attempt.upload_deadline_at_utc) + extraSeconds * 1000).toISOString()
      : null;
    const { error: timingError } = await supabase
      .from("attempts")
      .update({
        end_at_utc: nextEndAtUtc,
        upload_deadline_at_utc: nextUploadDeadlineAtUtc,
      })
      .eq("id", attemptId)
      .eq("exam_session_id", sessionId);
    if (timingError) throw timingError;
    details = {
      extra_seconds: extraSeconds,
      previous_end_at_utc: previousEndAtUtc,
      new_end_at_utc: nextEndAtUtc,
      previous_upload_deadline_at_utc: previousUploadDeadlineAtUtc,
      new_upload_deadline_at_utc: nextUploadDeadlineAtUtc,
    };
  }
  const { error } = await supabase.from("live_interventions").insert({
    exam_session_id: sessionId,
    attempt_id: attemptId,
    owner_profile_id: ownerProfileId,
    action_type: actionType,
    details_json: details as Json,
  });
  if (error) throw error;
  if (actionType === "pause") await supabase.from("attempts").update({ paused_at: new Date().toISOString() }).eq("id", attemptId);
  if (actionType === "resume") await supabase.from("attempts").update({ paused_at: null }).eq("id", attemptId);
  if (actionType === "force_submit") await supabase.from("attempts").update({ forced_submitted_at: new Date().toISOString() }).eq("id", attemptId);
  await supabase.rpc("audit_owner_action", {
    action: `live_intervention.${actionType}`,
    target_table: "attempts",
    target_id: attemptId,
    metadata_json: {
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
