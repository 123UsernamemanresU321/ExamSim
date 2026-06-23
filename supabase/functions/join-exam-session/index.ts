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
import {
  buildEdgeExamPolicySnapshot,
  loadAssessmentExamPolicy,
  resolveSessionExamPolicy,
} from "../_shared/exam-policy.ts";
import { guestSebEnabled } from "../_shared/seb.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{
      code?: string;
      student_name?: string;
      student_number?: string;
      class_group?: string;
      confirm_name_mismatch?: boolean;
    }>(request);
    const code = normalizeExamCode(body.code ?? "");
    if (!code) return json(request, { error: "Exam code is required" }, 400);

    const admin = getAdminClient();
    const { data: session, error } = await admin
      .from("exam_sessions")
      .select("*")
      .eq("code_hash", await hashExamSecret(code))
      .maybeSingle();
    if (error) throw error;
    if (!session) return json(request, { error: "That exam code was not found.", status: "invalid" }, 404);
    const { data: sessionVersion, error: sessionVersionError } = await admin
      .from("assessment_versions")
      .select("id,status,governance_status,assessment_id")
      .eq("id", session.assessment_version_id)
      .eq("assessment_id", session.assessment_id)
      .maybeSingle();
    if (sessionVersionError) throw sessionVersionError;
    if (!sessionVersion || sessionVersion.status !== "published" || sessionVersion.governance_status !== "published") {
      return json(request, {
        error: "This exam session is not linked to a frozen published assessment version.",
        code: "session_version_not_published",
      }, 503);
    }

    const accessStatus = publicSessionState(session);
    if (accessStatus === "invalid" || accessStatus === "not_open" || accessStatus === "closed") {
      return json(request, { error: "This exam is not available right now.", status: accessStatus }, 403);
    }
    if (session.mode === "seb_required" && !guestSebEnabled()) {
      return json(request, {
        error: "Guest Safe Exam Browser remains disabled until the configured .seb file passes validation with a real Safe Exam Browser client.",
        code: "guest_seb_live_validation_required",
      }, 503);
    }

    const identityPolicy = readIdentityPolicy(session.identity_policy_json);
    const identity = validateGuestIdentity(body, {
      requireStudentName: identityPolicy.requireStudentName,
      requireStudentNumber: identityPolicy.requireStudentNumber || identityPolicy.requireRosterMatch,
    });
    if (!identity.ok) return json(request, { error: identity.error }, 400);
    const effectiveStudentNumber = identity.studentNumber || `GUEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: rosterEntry, error: rosterError } = await admin
      .from("student_roster_entries")
      .select("id,student_profile_id,student_number,display_name,class_group,accommodations_json")
      .eq("owner_profile_id", session.owner_profile_id)
      .eq("student_number", effectiveStudentNumber)
      .eq("active", true)
      .maybeSingle();
    if (rosterError) throw rosterError;
    if (!rosterEntry && identityPolicy.requireRosterMatch && !identityPolicy.allowUnregisteredGuests) {
      return json(request, {
        error: "This student number was not found for this exam. Please check the number given by your teacher.",
        code: "student_number_not_found",
      }, 403);
    }
    const enteredName = String(body.student_name ?? "").trim();
    const shouldCheckName = identityPolicy.requireStudentName || enteredName.length > 0;
    const nameMismatch = Boolean(rosterEntry && shouldCheckName && !sameName(identity.studentName, String(rosterEntry.display_name ?? "")));
    if (nameMismatch && !body.confirm_name_mismatch) {
      return json(request, {
        error: `The name entered does not match the roster name for ${effectiveStudentNumber}. Check your details or confirm for teacher review.`,
        code: "student_name_mismatch",
        roster_display_name: rosterEntry?.display_name ?? null,
      }, 409);
    }

    const accessWindow = readAccessWindowPolicy(rosterEntry?.accommodations_json);
    const now = Date.now();
    if (accessWindow.openAtUtc && now < Date.parse(accessWindow.openAtUtc)) {
      return json(request, {
        error: "Your individual access window has not opened yet. Check the time provided by your teacher.",
        code: "student_access_not_open",
        opens_at_utc: accessWindow.openAtUtc,
      }, 403);
    }
    if (accessWindow.closeAtUtc && now >= Date.parse(accessWindow.closeAtUtc)) {
      return json(request, {
        error: "Your individual access window has closed. Contact your teacher.",
        code: "student_access_closed",
      }, 403);
    }

    const matchColumn = rosterEntry?.id ? "roster_entry_id" : "guest_student_number";
    const matchValue = rosterEntry?.id ?? effectiveStudentNumber;
    const { data: existingAttempts, error: existingError } = await admin
      .from("attempts")
      .select("*")
      .eq("exam_session_id", session.id)
      .eq(matchColumn, matchValue)
      .order("created_at", { ascending: false });
    if (existingError) throw existingError;

    let attemptRow = existingAttempts?.[0] as Record<string, unknown> | undefined;
    let attemptId = attemptRow?.id as string | undefined;
    const accommodationPolicy = readAccommodationPolicy(rosterEntry?.accommodations_json, Number(session.duration_seconds));
    if (!attemptId) {
      const assessmentPolicy = await loadAssessmentExamPolicy(
        admin,
        String(session.assessment_id),
        String(session.assessment_version_id),
      );
      const resolvedPolicy = resolveSessionExamPolicy(assessmentPolicy, session.settings_json, {
        tts: readTtsException(rosterEntry?.accommodations_json),
      });
      const examPolicySnapshot = buildEdgeExamPolicySnapshot(
        String(session.assessment_version_id),
        resolvedPolicy,
      );
      const endAt = new Date(Date.parse(session.start_at_utc) + (Number(session.duration_seconds) + accommodationPolicy.extraTimeSeconds) * 1000).toISOString();
      const uploadDeadlineAtUtc = session.upload_deadline_at_utc
        ? new Date(Date.parse(session.upload_deadline_at_utc) + (accommodationPolicy.extraTimeSeconds + accommodationPolicy.uploadExtensionSeconds) * 1000).toISOString()
        : null;
      const securitySettings = readRecord(session.security_settings_json);
      const sebBrowserExamKeys = readHashList(securitySettings.seb_browser_exam_key_hashes);
      const sebConfigKeys = readHashList(securitySettings.seb_config_key_hashes);
      if (session.mode === "seb_required" && (!sebBrowserExamKeys.length || !sebConfigKeys.length)) {
        return json(request, { error: "This SEB session is not configured with valid Browser Exam Key and Config Key values.", code: "seb_not_configured" }, 503);
      }
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
          guest_student_number: effectiveStudentNumber,
          guest_class_group: identity.classGroup,
          guest_identity_json: {
            student_name: identity.studentName,
            student_number: effectiveStudentNumber,
            class_group: identity.classGroup,
            roster_matched: Boolean(rosterEntry),
            roster_display_name: rosterEntry?.display_name ?? null,
            name_mismatch: nameMismatch,
            unregistered_guest: !rosterEntry,
          },
          claim_status: rosterEntry?.student_profile_id ? "linked" : "unclaimed",
          identity_review_status: rosterEntry && !nameMismatch ? "not_required" : "needs_review",
          duplicate_identity_flag: false,
          start_at_utc: session.start_at_utc,
          duration_seconds: session.duration_seconds,
          end_at_utc: endAt,
          upload_deadline_at_utc: uploadDeadlineAtUtc,
          display_timezone: session.display_timezone,
          delivery_mode: session.mode === "seb_required" ? "seb_required" : "browser",
          solutions_requested: true,
          typed_enabled: true,
          per_question_upload_enabled: true,
          require_blank_for_skipped: true,
          seb_browser_exam_key_hashes: sebBrowserExamKeys,
          seb_config_key_hashes: sebConfigKeys,
          seb_config_path: null,
          exam_policy_json: examPolicySnapshot,
        })
        .select("*")
        .single();
      if (insertError) throw insertError;
      attemptId = attempt.id;
      attemptRow = attempt;
      await admin.rpc("create_upload_slots_for_attempt", { target_attempt_id: attemptId });
      if (!attemptId) throw new Error("Could not create guest attempt");
      await recordRosterAccommodations(admin, attemptId, String(session.owner_profile_id), accommodationPolicy);
    }
    if (!attemptId) throw new Error("Could not create or resume attempt");
    if (!attemptRow) throw new Error("Could not load guest attempt");

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
      startAtUtc: String(attemptRow.start_at_utc),
      endAtUtc: String(attemptRow.end_at_utc),
      uploadDeadlineAtUtc: attemptRow.upload_deadline_at_utc ? String(attemptRow.upload_deadline_at_utc) : null,
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
        start_at_utc: String(attemptRow.start_at_utc),
        end_at_utc: String(attemptRow.end_at_utc),
        upload_deadline_at_utc: attemptRow.upload_deadline_at_utc ? String(attemptRow.upload_deadline_at_utc) : null,
      }),
      session_status: accessStatus,
      roster_match: Boolean(rosterEntry),
      identity_review_status: rosterEntry && !nameMismatch ? "not_required" : "needs_review",
    });
  } catch (error) {
    return errorResponse(request, error, "join-exam-session failed");
  }
});

function readIdentityPolicy(value: unknown) {
  const policy = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const allowUnregisteredGuests = policy.allow_unregistered_guests === true;
  return {
    allowUnregisteredGuests,
    requireRosterMatch: policy.require_roster_match !== false,
    requireStudentName: policy.student_name !== false,
    requireStudentNumber: policy.student_number !== false,
  };
}

function sameName(input: string, rosterName: string) {
  return normalizeName(input) === normalizeName(rosterName);
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function readAccommodationPolicy(value: unknown, baseDurationSeconds: number) {
  const policy = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const extraTimeSeconds = readSeconds(policy.extra_time_seconds)
    ?? readMinutes(policy.extra_time_minutes)
    ?? readPercent(policy.extra_time_percent, baseDurationSeconds)
    ?? 0;
  const uploadExtensionSeconds = readSeconds(policy.upload_extension_seconds)
    ?? readMinutes(policy.upload_extension_minutes)
    ?? 0;
  return {
    extraTimeSeconds: Math.min(Math.max(extraTimeSeconds, 0), 4 * 60 * 60),
    uploadExtensionSeconds: Math.min(Math.max(uploadExtensionSeconds, 0), 4 * 60 * 60),
  };
}

function readTtsException(value: unknown) {
  const policy = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return policy.tts_allowed === true;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readHashList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).map((item) => item.trim().toLowerCase()).filter((item) => /^[a-f0-9]{64}$/.test(item)))]
    : [];
}

function readAccessWindowPolicy(value: unknown) {
  const policy = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    openAtUtc: readIso(policy.access_open_at_utc),
    closeAtUtc: readIso(policy.access_close_at_utc),
  };
}

function readIso(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function readSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : null;
}

function readMinutes(value: unknown) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes * 60) : null;
}

function readPercent(value: unknown, baseDurationSeconds: number) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent <= 0 || !Number.isFinite(baseDurationSeconds) || baseDurationSeconds <= 0) return null;
  return Math.floor(baseDurationSeconds * (percent / 100));
}

async function recordRosterAccommodations(
  admin: ReturnType<typeof getAdminClient>,
  attemptId: string,
  ownerProfileId: string,
  policy: { extraTimeSeconds: number; uploadExtensionSeconds: number },
) {
  const rows = [];
  if (policy.extraTimeSeconds > 0) {
    rows.push({
      attempt_id: attemptId,
      created_by_profile_id: ownerProfileId,
      accommodation_type: "extra_time",
      extra_seconds: policy.extraTimeSeconds,
      reason: "Applied automatically from the roster accommodation policy.",
    });
  }
  if (policy.uploadExtensionSeconds > 0) {
    rows.push({
      attempt_id: attemptId,
      created_by_profile_id: ownerProfileId,
      accommodation_type: "upload_extension",
      extra_seconds: policy.uploadExtensionSeconds,
      reason: "Applied automatically from the roster accommodation policy.",
    });
  }
  if (rows.length) {
    const { error } = await admin.from("attempt_accommodations").insert(rows);
    if (error) throw error;
  }
}
