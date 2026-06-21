import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string }>(request);
    if (!body.attempt_id) return json(request, { error: "attempt_id is required" }, 400);

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("*, assessments(title, paper_code, owner_profile_id)")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    if (attempt.assignee_profile_id !== profile.id) return json(request, { error: "Forbidden" }, 403);

    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      solutionsRequested: attempt.solutions_requested,
    });
    const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments;
    const attemptSummary = {
      id: attempt.id,
      title: assessment?.title ?? "Untitled assessment",
      paper_code: assessment?.paper_code ?? null,
      student: attempt.assignee_profile_id,
      start_at_utc: attempt.start_at_utc,
      end_at_utc: attempt.end_at_utc,
      upload_deadline_at_utc: attempt.upload_deadline_at_utc,
      duration_seconds: attempt.duration_seconds,
      display_timezone: attempt.display_timezone,
      solutions_requested: attempt.solutions_requested,
      delivery_mode: attempt.delivery_mode,
      state,
      countdown_target_utc: null,
      server_now_utc: new Date().toISOString(),
      owner_profile_id: assessment?.owner_profile_id ?? "",
      seb_config_path: attempt.seb_config_path,
      seb_config_url: null,
    };

    const { data: feedbackRelease, error: feedbackError } = await admin
      .from("feedback_releases")
      .select("*")
      .eq("attempt_id", attempt.id)
      .eq("visible_to_student", true)
      .is("revoked_at", null)
      .order("released_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (feedbackError) throw feedbackError;

    if (!feedbackRelease?.visible_to_student) {
      return json(request, {
        attempt: attemptSummary,
        questionNodes: [],
        uploadSlots: [],
        textResponses: [],
        moderationReport: null,
        attemptEvents: [],
        package: null,
        packageError: "Feedback for this attempt has not been released yet.",
        marks: [],
        annotations: [],
        workAnnotations: [],
        markingTickets: [],
        markingTicketMessages: [],
        uploadUrls: {},
        annotatedUploadUrls: {},
        feedbackRelease: null,
        markschemeHtml: null,
        markschemePdfPath: null,
        sourceObjectPath: null,
        commentBank: [],
      });
    }

    if (profile.app_role === "student" && feedbackRelease?.id) {
      await markVisibleFeedbackRead(admin, profile.id, attempt.id, feedbackRelease.id);
    }

    const [
      { data: questionNodes, error: nodeError },
      { data: uploadSlots, error: slotError },
      { data: textResponses, error: responseError },
      { data: marks, error: marksError },
      { data: annotations, error: annotationsError },
      { data: workAnnotations, error: workAnnotationError },
      { data: markingTickets, error: ticketError },
      { data: version, error: versionError },
    ] = await Promise.all([
      admin
        .from("question_nodes")
        .select("id, assessment_version_id, parent_node_id, node_key, ordinal, node_type, title, prompt_html, prompt_latex, marks, response_mode, interaction_json, markscheme_html, assets, source_page_start, source_page_end, created_at")
        .eq("assessment_version_id", attempt.assessment_version_id)
        .order("ordinal", { ascending: true }),
      admin.from("upload_slots").select("*").eq("attempt_id", attempt.id).order("created_at", { ascending: true }),
      admin.from("text_responses").select("*").eq("attempt_id", attempt.id).order("saved_at", { ascending: true }),
      admin.from("marks").select("*").eq("attempt_id", attempt.id).order("created_at", { ascending: true }),
      admin
        .from("submission_annotations")
        .select("*")
        .eq("attempt_id", attempt.id)
        .eq("annotation_type", "feedback")
        .order("created_at", { ascending: true }),
      admin
        .from("work_annotations")
        .select("*")
        .eq("attempt_id", attempt.id)
        .eq("visibility", "student_visible")
        .order("created_at", { ascending: true }),
      admin
        .from("marking_tickets")
        .select("*")
        .eq("attempt_id", attempt.id)
        .order("updated_at", { ascending: false }),
      admin
        .from("assessment_versions")
        .select("markscheme_html, markscheme_pdf_path")
        .eq("id", attempt.assessment_version_id)
        .maybeSingle(),
    ]);
    if (nodeError) throw nodeError;
    if (slotError) throw slotError;
    if (responseError) throw responseError;
    if (marksError) throw marksError;
    if (annotationsError) throw annotationsError;
    if (workAnnotationError) throw workAnnotationError;
    if (ticketError) throw ticketError;
    if (versionError) throw versionError;

    const ticketIds = (markingTickets ?? []).map((ticket) => ticket.id);
    const { data: markingTicketMessages, error: ticketMessageError } = ticketIds.length
      ? await admin
          .from("marking_ticket_messages")
          .select("*")
          .in("ticket_id", ticketIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (ticketMessageError) throw ticketMessageError;

    const uploadUrls: Record<string, string> = {};
    const annotatedUploadUrls: Record<string, string> = {};
    for (const slot of uploadSlots ?? []) {
      if (slot.annotated_object_path) {
        const { data: annotatedSigned, error: annotatedError } = await admin.storage.from("marking-packets").createSignedUrl(slot.annotated_object_path, 300);
        if (!annotatedError && annotatedSigned?.signedUrl) annotatedUploadUrls[slot.id] = annotatedSigned.signedUrl;
      }
    }

    return json(request, {
      attempt: attemptSummary,
      questionNodes: questionNodes ?? [],
      uploadSlots: uploadSlots ?? [],
      textResponses: textResponses ?? [],
      moderationReport: null,
      attemptEvents: [],
      package: null,
      packageError: null,
      marks: feedbackRelease?.release_marks !== false ? marks ?? [] : [],
      annotations: feedbackRelease?.release_comments !== false ? annotations ?? [] : [],
      workAnnotations: workAnnotations ?? [],
      markingTickets: markingTickets ?? [],
      markingTicketMessages: markingTicketMessages ?? [],
      uploadUrls,
      annotatedUploadUrls: feedbackRelease?.release_annotated_pdfs !== false ? annotatedUploadUrls : {},
      feedbackRelease: feedbackRelease ?? null,
      markschemeHtml: version?.markscheme_html ?? null,
      markschemePdfPath: version?.markscheme_pdf_path ?? null,
      sourceObjectPath: null,
      commentBank: [],
    });
  } catch (error) {
    return errorResponse(request, error, "get-student-results failed");
  }
});

async function markVisibleFeedbackRead(admin: any, studentProfileId: string, attemptId: string, currentReleaseId: string) {
  const { data: releases, error: releaseError } = await admin
    .from("feedback_releases")
    .select("id")
    .eq("attempt_id", attemptId)
    .eq("visible_to_student", true)
    .is("revoked_at", null);
  if (releaseError) {
    console.warn("Could not load visible feedback releases for read receipt", releaseError);
    return;
  }
  const releaseIds = new Set<string>((releases ?? []).map((release: { id: string }) => release.id));
  releaseIds.add(currentReleaseId);
  const now = new Date().toISOString();
  for (const releaseId of releaseIds) {
    const { error } = await admin.from("student_feedback_reads").upsert(
      {
        student_profile_id: studentProfileId,
        attempt_id: attemptId,
        feedback_release_id: releaseId,
        read_at: now,
      },
      { onConflict: "student_profile_id,attempt_id,feedback_release_id" },
    );
    if (error) console.warn("Could not mark feedback release as read", { attemptId, releaseId, error });
  }
}
