export type { AssessmentWorkspace } from "./live-data";

export async function getAssessmentWorkspaceClient(assessmentId: string, supabase: any): Promise<AssessmentWorkspace | null> {
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

  const parseJobIds = (parseJobs ?? []).map((job: any) => job.id);
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
