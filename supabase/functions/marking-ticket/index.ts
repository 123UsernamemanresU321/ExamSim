import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, getJwtPayload, profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  action: "create" | "reply" | "update_status";
  attempt_id?: string;
  question_node_id?: string | null;
  work_annotation_id?: string | null;
  ticket_id?: string;
  subject?: string;
  message?: string;
  status?: "open" | "owner_review" | "student_reply" | "resolved" | "closed";
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const auth = await requireUser(request);
    const profile = await profileForAuthUser(auth.user.id);
    const body = await readJson<Body>(request);

    if (body.action === "create") {
      return await createTicket(auth.admin, auth.jwt, auth.user.id, profile, body);
    }
    if (body.action === "reply") {
      return await replyToTicket(auth.admin, auth.jwt, profile, body);
    }
    if (body.action === "update_status") {
      return await updateTicketStatus(auth.admin, auth.jwt, profile, body);
    }
    return json({ error: "Invalid ticket action" }, 400);
  } catch (error) {
    return errorResponse(error, "marking-ticket failed");
  }
});

async function createTicket(admin: any, jwt: string, authUserId: string, profile: any, body: Body) {
  if (!body.attempt_id || !body.subject?.trim() || !body.message?.trim()) {
    return json({ error: "attempt_id, subject, and message are required" }, 400);
  }
  if (profile.app_role === "owner") requireAal2(jwt);

  const context = await loadAttemptContext(admin, body.attempt_id, profile);
  if (profile.app_role !== "owner") await assertFeedbackReleased(admin, body.attempt_id);
  await validateQuestionAndAnnotation(admin, context.attempt, body.question_node_id ?? null, body.work_annotation_id ?? null);

  const { data: ticket, error: ticketError } = await admin
    .from("marking_tickets")
    .insert({
      attempt_id: context.attempt.id,
      question_node_id: body.question_node_id ?? null,
      work_annotation_id: body.work_annotation_id ?? null,
      owner_profile_id: context.ownerProfileId,
      student_profile_id: context.attempt.assignee_profile_id,
      opened_by_profile_id: profile.id,
      subject: body.subject.trim(),
      status: profile.app_role === "owner" ? "student_reply" : "owner_review",
    })
    .select("*")
    .single();
  if (ticketError) throw ticketError;

  const { data: message, error: messageError } = await admin
    .from("marking_ticket_messages")
    .insert({
      ticket_id: ticket.id,
      author_profile_id: profile.id,
      author_role: profile.app_role === "owner" ? "owner" : "student",
      body: body.message.trim(),
    })
    .select("*")
    .single();
  if (messageError) throw messageError;

  if (profile.app_role === "owner") {
    await auditOwnerAction(profile.id, authUserId, "marking_ticket.created", "attempts", context.attempt.id, {
      ticket_id: ticket.id,
      question_node_id: body.question_node_id ?? null,
    });
  }

  return json({ ok: true, ticket, message });
}

async function replyToTicket(admin: any, jwt: string, profile: any, body: Body) {
  if (!body.ticket_id || !body.message?.trim()) return json({ error: "ticket_id and message are required" }, 400);
  const ticket = await loadTicketForActor(admin, body.ticket_id, profile);
  if (profile.app_role === "owner") requireAal2(jwt);

  const { data: message, error: messageError } = await admin
    .from("marking_ticket_messages")
    .insert({
      ticket_id: ticket.id,
      author_profile_id: profile.id,
      author_role: profile.app_role === "owner" ? "owner" : "student",
      body: body.message.trim(),
    })
    .select("*")
    .single();
  if (messageError) throw messageError;

  const nextStatus = profile.app_role === "owner" ? "student_reply" : "owner_review";
  const { error: updateError } = await admin
    .from("marking_tickets")
    .update({ status: nextStatus })
    .eq("id", ticket.id);
  if (updateError) throw updateError;

  if (profile.app_role === "owner") {
    await auditOwnerAction(profile.id, profile.auth_user_id, "marking_ticket.replied", "attempts", ticket.attempt_id, {
      ticket_id: ticket.id,
    });
  }

  return json({ ok: true, message, status: nextStatus });
}

async function updateTicketStatus(admin: any, jwt: string, profile: any, body: Body) {
  if (!body.ticket_id || !body.status) return json({ error: "ticket_id and status are required" }, 400);
  if (profile.app_role !== "owner") return json({ error: "Owner role required" }, 403);
  requireAal2(jwt);
  const ticket = await loadTicketForActor(admin, body.ticket_id, profile);
  const status = ["open", "owner_review", "student_reply", "resolved", "closed"].includes(body.status) ? body.status : null;
  if (!status) return json({ error: "Invalid ticket status" }, 400);

  const { data, error } = await admin
    .from("marking_tickets")
    .update({ status })
    .eq("id", ticket.id)
    .select("*")
    .single();
  if (error) throw error;
  await auditOwnerAction(profile.id, profile.auth_user_id, "marking_ticket.status_updated", "attempts", ticket.attempt_id, {
    ticket_id: ticket.id,
    status,
  });
  return json({ ok: true, ticket: data });
}

async function loadAttemptContext(admin: any, attemptId: string, profile: any) {
  const { data: attempt, error: attemptError } = await admin
    .from("attempts")
    .select("id, assessment_id, assessment_version_id, assignee_profile_id")
    .eq("id", attemptId)
    .single();
  if (attemptError) throw attemptError;

  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("owner_profile_id")
    .eq("id", attempt.assessment_id)
    .single();
  if (assessmentError) throw assessmentError;

  if (profile.app_role === "owner") {
    if (assessment.owner_profile_id !== profile.id) throw new Error("Forbidden");
  } else if (attempt.assignee_profile_id !== profile.id) {
    throw new Error("Forbidden");
  }

  return { attempt, ownerProfileId: assessment.owner_profile_id };
}

async function loadTicketForActor(admin: any, ticketId: string, profile: any) {
  const { data: ticket, error } = await admin
    .from("marking_tickets")
    .select("*")
    .eq("id", ticketId)
    .single();
  if (error) throw error;

  if (profile.app_role === "owner") {
    if (ticket.owner_profile_id !== profile.id) throw new Error("Forbidden");
  } else if (ticket.student_profile_id !== profile.id) {
    throw new Error("Forbidden");
  }
  return ticket;
}

async function assertFeedbackReleased(admin: any, attemptId: string) {
  const { data, error } = await admin
    .from("feedback_releases")
    .select("id, visible_to_student")
    .eq("attempt_id", attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.visible_to_student) throw new Error("Feedback has not been released for discussion");
}

async function validateQuestionAndAnnotation(admin: any, attempt: any, questionNodeId: string | null, annotationId: string | null) {
  if (questionNodeId) {
    const { data, error } = await admin
      .from("question_nodes")
      .select("id")
      .eq("id", questionNodeId)
      .eq("assessment_version_id", attempt.assessment_version_id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error("Question node not found");
  }

  if (annotationId) {
    const { data, error } = await admin
      .from("work_annotations")
      .select("id")
      .eq("id", annotationId)
      .eq("attempt_id", attempt.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error("Work annotation not found");
  }
}

function requireAal2(jwt: string) {
  const payload = getJwtPayload(jwt);
  if (payload.aal !== "aal2") throw new Error("Owner MFA/AAL2 required for this action");
}
