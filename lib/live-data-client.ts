import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssessmentWorkspace, AttemptReviewWorkspace, AttemptSummary } from "./live-data";
export type { AssessmentWorkspace, AttemptReviewWorkspace, AttemptSummary };

export async function getAssessmentWorkspaceClient(assessmentId: string, supabase: SupabaseClient): Promise<AssessmentWorkspace | null> {
  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment) return null;

  const { data: versions, error: versionError } = await supabase
    .from("assessment_versions")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("version_no", { ascending: false });
  if (versionError) throw versionError;

  const latestVersion = versions?.[0] ?? null;
  const { data: questionNodes, error: nodeError } = latestVersion
    ? await supabase
        .from("question_nodes")
        .select("*")
        .eq("assessment_version_id", latestVersion.id)
        .order("ordinal", { ascending: true })
    : { data: [], error: null };
  if (nodeError) throw nodeError;

  const { data: parseJobs, error: parseJobError } = latestVersion
    ? await supabase
        .from("parse_jobs")
        .select("*")
        .eq("assessment_version_id", latestVersion.id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (parseJobError) throw parseJobError;

  const parseJobIds = (parseJobs ?? []).map((job: { id: string }) => job.id);
  const { data: parseArtifacts, error: artifactError } = parseJobIds.length
    ? await supabase
        .from("parse_job_artifacts")
        .select("*")
        .in("parse_job_id", parseJobIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (artifactError) throw artifactError;

  return {
    assessment,
    versions: versions ?? [],
    latestVersion,
    questionNodes: questionNodes ?? [],
    parseJobs: parseJobs ?? [],
    parseArtifacts: parseArtifacts ?? [],
  };
}
export async function getStudentAttemptResultsWorkspaceClient(attemptId: string, supabase: SupabaseClient): Promise<AttemptReviewWorkspace | null> {
  const { data: attemptRow, error: attemptError } = await supabase.from("attempts").select("*").eq("id", attemptId).maybeSingle();
  if (attemptError) throw attemptError;
  if (!attemptRow) return null;

  const [
    { data: feedbackRelease, error: feedbackError },
    { data: questionNodes, error: nodeError },
    { data: uploadSlots, error: slotError },
    { data: textResponses, error: responseError },
    { data: marks, error: marksError },
    { data: annotations, error: annotationsError },
    { data: version, error: versionError },
  ] = await Promise.all([
    supabase.from("feedback_releases").select("*").eq("attempt_id", attemptId).maybeSingle(),
    supabase.from("question_nodes").select("*").eq("assessment_version_id", attemptRow.assessment_version_id).order("ordinal", { ascending: true }),
    supabase.from("upload_slots").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: true }),
    supabase.from("text_responses").select("*").eq("attempt_id", attemptId).order("saved_at", { ascending: true }),
    supabase.from("marks").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: true }),
    supabase.from("submission_annotations").select("*").eq("attempt_id", attemptId).eq("annotation_type", "feedback").order("created_at", { ascending: true }),
    supabase.from("assessment_versions").select("*").eq("id", attemptRow.assessment_version_id).maybeSingle(),
  ]);

  if (feedbackError) throw feedbackError;
  if (nodeError) throw nodeError;
  if (slotError) throw slotError;
  if (responseError) throw responseError;
  if (marksError) throw marksError;
  if (annotationsError) throw annotationsError;
  if (versionError) throw versionError;

  // Since we are in the client, we can't easily run loadAssessmentPackage (which might have node deps)
  // But actually loadAssessmentPackage in this repo is browser safe!
  const { loadAssessmentPackage } = await import("@/lib/package-loader");
  const { reconstructQuestionTree } = await import("@/lib/assessment-package");

  const packageResult = await loadAssessmentPackage(version ?? {}, supabase);
  const questions = questionNodes ? reconstructQuestionTree(questionNodes) : (packageResult.package?.questions ?? []);

  // Map attempt row (minimal version)
  const attempt = {
    id: attemptRow.id,
    title: attemptRow.assessment_id, // Placeholder
    paper_code: null,
    student: attemptRow.assignee_profile_id,
    start_at_utc: attemptRow.start_at_utc,
    end_at_utc: attemptRow.end_at_utc,
    upload_deadline_at_utc: attemptRow.upload_deadline_at_utc,
    duration_seconds: 3600,
    display_timezone: "UTC",
    solutions_requested: attemptRow.solutions_requested,
    delivery_mode: attemptRow.delivery_mode,
    state: "FINISHED_REVIEW",
    countdown_target_utc: null,
    server_now_utc: new Date().toISOString(),
    owner_profile_id: "",
    seb_config_path: null,
    seb_config_url: null,
  };

  return {
    attempt: attempt as unknown as AttemptSummary,
    questionNodes: questionNodes ?? [],
    uploadSlots: uploadSlots ?? [],
    textResponses: textResponses ?? [],
    moderationReport: null,
    attemptEvents: [],
    package: packageResult.package ? { ...packageResult.package, questions } : null,
    packageError: !feedbackRelease || !feedbackRelease.visible_to_student ? "Feedback for this attempt has not been released yet." : packageResult.error,
    marks: marks ?? [],
    annotations: annotations ?? [],
    feedbackRelease: feedbackRelease ?? null,
    markschemeHtml: version?.markscheme_html ?? null,
    markschemePdfPath: version?.markscheme_pdf_path ?? null,
    commentBank: [],
  };
}
