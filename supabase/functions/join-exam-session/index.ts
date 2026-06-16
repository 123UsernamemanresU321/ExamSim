import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState, getCountdownTarget } from "../_shared/attempt-state.ts";
import { handleOptions, json, readJson, errorResponse } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import {
  generateGuestAccessToken,
  hashExamSecret,
  hashOpaqueToken,
  normalizeExamCode,
  publicSessionState,
  validateGuestIdentity,
} from "../_shared/examsim-guest.ts";
import { signStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{
      code?: string;
      student_name?: string;
      student_number?: string;
      class_group?: string;
    }>(request);
    const code = normalizeExamCode(body.code ?? "");
    const identity = validateGuestIdentity(body);
    if (!code || !identity.ok) return json(request, { error: identity.ok ? "Exam code is required" : identity.error }, 400);

    const admin = getAdminClient();
    const { data: session, error } = await admin
      .from("exam_sessions")
      .select("*")
      .eq("code_hash", await hashExamSecret(code))
      .maybeSingle();
    if (error) throw error;
    if (!session) return json(request, { error: "That exam code was not found.", status: "invalid" }, 404);

    const accessStatus = publicSessionState(session);
    if (accessStatus === "invalid" || accessStatus === "not_open" || accessStatus === "closed") {
      return json(request, { error: "This exam is not available right now.", status: accessStatus }, 403);
    }

    const { data: rosterEntry, error: rosterError } = await admin
      .from("student_roster_entries")
      .select("id,student_profile_id,student_number,display_name,class_group,accommodations_json")
      .eq("owner_profile_id", session.owner_profile_id)
      .eq("student_number", identity.studentNumber)
      .eq("active", true)
      .maybeSingle();
    if (rosterError) throw rosterError;

    const matchColumn = rosterEntry?.id ? "roster_entry_id" : "guest_student_number";
    const matchValue = rosterEntry?.id ?? identity.studentNumber;
    const { data: existingAttempts, error: existingError } = await admin
      .from("attempts")
      .select("id,state_cache,created_at")
      .eq("exam_session_id", session.id)
      .eq(matchColumn, matchValue)
      .order("created_at", { ascending: false });
    if (existingError) throw existingError;

    let attemptId = existingAttempts?.[0]?.id as string | undefined;
    if (!attemptId) {
      const endAt = new Date(Date.parse(session.start_at_utc) + Number(session.duration_seconds) * 1000).toISOString();
      const { data: attempt, error: insertError } = await admin
        .from("attempts")
        .insert({
          assessment_id: session.assessment_id,
          assessment_version_id: session.assessment_version_id,
          assessment_assignment_id: null,
          assignee_profile_id: rosterEntry?.student_profile_id ?? null,
          exam_session_id: session.id,
          roster_entry_id: rosterEntry?.id ?? null,
          guest_student_name: identity.studentName,
          guest_student_number: identity.studentNumber,
          guest_class_group: identity.classGroup,
          guest_identity_json: {
            student_name: identity.studentName,
            student_number: identity.studentNumber,
            class_group: identity.classGroup,
            roster_matched: Boolean(rosterEntry),
          },
          claim_status: rosterEntry?.student_profile_id ? "linked" : "unclaimed",
          identity_review_status: rosterEntry ? "not_required" : "needs_review",
          duplicate_identity_flag: false,
          start_at_utc: session.start_at_utc,
          duration_seconds: session.duration_seconds,
          end_at_utc: endAt,
          upload_deadline_at_utc: session.upload_deadline_at_utc,
          display_timezone: session.display_timezone,
          delivery_mode: session.mode === "seb_required" ? "seb_required" : "browser",
          solutions_requested: true,
          typed_enabled: true,
          per_question_upload_enabled: true,
          require_blank_for_skipped: true,
          seb_browser_exam_key_hashes: [],
          seb_config_key_hashes: [],
          seb_config_path: null,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      attemptId = attempt.id;
      await admin.rpc("create_upload_slots_for_attempt", { target_attempt_id: attemptId });
    }
    if (!attemptId) throw new Error("Could not create or resume attempt");

    const guestToken = generateGuestAccessToken();
    await admin.from("attempt_access_tokens").insert({
      attempt_id: attemptId,
      exam_session_id: session.id,
      token_hash: await hashOpaqueToken(guestToken),
      purpose: "guest_attempt",
      expires_at: session.upload_deadline_at_utc ?? session.close_at_utc,
    });

    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: session.start_at_utc,
      endAtUtc: new Date(Date.parse(session.start_at_utc) + Number(session.duration_seconds) * 1000).toISOString(),
      uploadDeadlineAtUtc: session.upload_deadline_at_utc,
      solutionsRequested: true,
    });
    const stateToken = await signStateToken({
      token_id: crypto.randomUUID(),
      attempt_id: attemptId,
      profile_id: `guest:${attemptId}`,
      computed_state: state,
      server_now_utc: new Date().toISOString(),
      expires_at_utc: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      delivery_mode: session.mode === "seb_required" ? "seb_required" : "browser",
      seb_verified: false,
    });

    return json(request, {
      ok: true,
      attempt_id: attemptId,
      guest_token: guestToken,
      state_token: stateToken,
      state,
      countdown_target_utc: getCountdownTarget(state, {
        start_at_utc: session.start_at_utc,
        end_at_utc: new Date(Date.parse(session.start_at_utc) + Number(session.duration_seconds) * 1000).toISOString(),
        upload_deadline_at_utc: session.upload_deadline_at_utc,
      }),
      session_status: accessStatus,
    });
  } catch (error) {
    return errorResponse(request, error, "join-exam-session failed");
  }
});
