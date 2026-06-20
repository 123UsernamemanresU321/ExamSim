import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState, getCountdownTarget } from "../_shared/attempt-state.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { handleOptions, json, readJson, errorResponse } from "../_shared/http.ts";
import { signStateToken } from "../_shared/state-token.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { loadAttemptAccommodationPolicy } from "../_shared/accommodations.ts";

type StudentVisibleMessage = {
  id: string;
  message_kind: "broadcast" | "private" | "system";
  sender_kind: "owner" | "student_guest" | "student_account" | "system";
  body: string;
  created_at: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{ guest_token?: string; attempt_id?: string }>(request);
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const serverNowUtc = new Date().toISOString();
    const state = computeAttemptState({
      serverNowUtc,
      startAtUtc: String(attempt.start_at_utc),
      endAtUtc: String(attempt.end_at_utc),
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc ? String(attempt.upload_deadline_at_utc) : null,
      pausedAtUtc: attempt.paused_at ? String(attempt.paused_at) : null,
      solutionsRequested: Boolean(attempt.solutions_requested),
    });
    const stateToken = await signStateToken({
      token_id: crypto.randomUUID(),
      attempt_id: attempt.id,
      profile_id: `guest:${attempt.id}`,
      computed_state: state,
      server_now_utc: serverNowUtc,
      expires_at_utc: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      delivery_mode: attempt.delivery_mode === "seb_required" ? "seb_required" : "browser",
      seb_verified: false,
    });
    const invigilationMessages = attempt.exam_session_id
      ? await loadStudentVisibleMessages(String(attempt.exam_session_id), String(attempt.id))
      : [];
    const accommodationPolicy = await loadAttemptAccommodationPolicy(getAdminClient(), attempt);
    return json(request, {
      attempt_id: attempt.id,
      state,
      server_now_utc: serverNowUtc,
      display_timezone: attempt.display_timezone,
      countdown_target_utc: getCountdownTarget(state, {
        start_at_utc: String(attempt.start_at_utc),
        end_at_utc: String(attempt.end_at_utc),
        upload_deadline_at_utc: attempt.upload_deadline_at_utc ? String(attempt.upload_deadline_at_utc) : null,
      }),
      state_token: stateToken,
      invigilation_messages: invigilationMessages,
      accommodation_policy: accommodationPolicy,
    });
  } catch (error) {
    return errorResponse(request, error, "guest-get-attempt-state failed");
  }
});

async function loadStudentVisibleMessages(examSessionId: string, attemptId: string): Promise<StudentVisibleMessage[]> {
  const admin = getAdminClient();
  const [broadcasts, directMessages] = await Promise.all([
    admin
      .from("invigilation_messages")
      .select("id,message_kind,sender_kind,body,created_at")
      .eq("exam_session_id", examSessionId)
      .eq("message_kind", "broadcast")
      .eq("visible_to_student", true)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("invigilation_messages")
      .select("id,message_kind,sender_kind,body,created_at")
      .eq("exam_session_id", examSessionId)
      .eq("attempt_id", attemptId)
      .eq("visible_to_student", true)
      .in("message_kind", ["private", "system"])
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (broadcasts.error) throw broadcasts.error;
  if (directMessages.error) throw directMessages.error;
  return [...(broadcasts.data ?? []), ...(directMessages.data ?? [])]
    .sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)))
    .slice(0, 12) as StudentVisibleMessage[];
}
