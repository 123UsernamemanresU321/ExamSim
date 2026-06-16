import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleOptions, json, readJson, errorResponse } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { hashExamSecret, normalizeExamCode, publicSessionState } from "../_shared/examsim-guest.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{ code?: string }>(request);
    const code = normalizeExamCode(body.code ?? "");
    if (!code) return json(request, { status: "invalid", error: "Enter an exam code." }, 400);

    const codeHash = await hashExamSecret(code);
    const admin = getAdminClient();
    const { data: session, error } = await admin
      .from("exam_sessions")
      .select("id,title,status,mode,open_at_utc,start_at_utc,close_at_utc,duration_seconds,upload_deadline_at_utc,display_timezone,attempt_limit_per_student,identity_policy_json,assessment_id,assessment_version_id,assessments(title,paper_code,subject)")
      .eq("code_hash", codeHash)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json(request, { status: "invalid", error: "That exam code was not found." }, 404);

    const status = publicSessionState(session);
    return json(request, {
      status,
      code,
      session: publicSessionSummary(session),
      server_now_utc: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(request, error, "resolve-exam-code failed");
  }
});

function publicSessionSummary(session: Record<string, unknown>) {
  const assessment = Array.isArray(session.assessments) ? session.assessments[0] : session.assessments;
  const assessmentRecord = assessment && typeof assessment === "object" ? assessment as Record<string, unknown> : {};
  return {
    id: session.id,
    title: session.title ?? assessmentRecord.title,
    assessment_title: assessmentRecord.title ?? session.title,
    paper_code: assessmentRecord.paper_code ?? null,
    subject: assessmentRecord.subject ?? null,
    mode: session.mode,
    open_at_utc: session.open_at_utc,
    start_at_utc: session.start_at_utc,
    close_at_utc: session.close_at_utc,
    duration_seconds: session.duration_seconds,
    upload_deadline_at_utc: session.upload_deadline_at_utc,
    display_timezone: session.display_timezone,
    attempt_limit_per_student: session.attempt_limit_per_student,
    identity_policy_json: session.identity_policy_json,
  };
}
