import { headers } from "next/headers";
import { normalizedPackageSchema, type NormalizedAssessmentPackage } from "@/lib/assessment-package";
import { attemptWithState, samplePackage } from "@/lib/demo-data";
import { invokeEdgeFunctionServer } from "@/lib/edge/server";
import type { AttemptSummary } from "@/lib/live-data";
import { isDemoModeEnabled } from "@/lib/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Assessment, Attempt } from "@/types/database";

type AttemptStateResponse = {
  attempt_id: string;
  state: AttemptSummary["state"];
  server_now_utc: string;
  display_timezone: string;
  countdown_target_utc: string | null;
  delivery_mode: string;
  solutions_requested: boolean;
  state_token: string;
};

type AttemptPackageResponse = {
  attempt_id: string;
  state: AttemptSummary["state"];
  assessment_package: unknown;
};

export type AttemptScreenData = {
  attempt: AttemptSummary;
  stateToken: string;
  package: NormalizedAssessmentPackage | null;
  packageError: string | null;
  responses: { question_node_id: string; answer_text: string; saved_at: string }[];
  annotations: { question_node_id: string | null; annotation_type: string; body: string }[];
  sebConfigUrl: string | null;
};

function demoAttemptScreenData(attemptId: string, includePackage: boolean): AttemptScreenData {
  const attempt = attemptWithState(attemptId);
  return {
    attempt: {
      id: attempt.id,
      title: attempt.title,
      paper_code: attempt.paper_code ?? null,
      student: attempt.student,
      start_at_utc: attempt.start_at_utc,
      end_at_utc: attempt.end_at_utc,
      upload_deadline_at_utc: attempt.upload_deadline_at_utc,
      duration_seconds: attempt.duration_seconds,
      display_timezone: attempt.display_timezone,
      solutions_requested: attempt.solutions_requested,
      delivery_mode: attempt.delivery_mode,
      state: attempt.state,
      countdown_target_utc: attempt.countdown_target_utc,
      server_now_utc: attempt.server_now_utc,
      owner_profile_id: "demo_owner",
      seb_config_path: null,
    },
    stateToken: "demo-state-token",
    package: includePackage && attempt.state !== "WAITING" ? samplePackage : null,
    packageError: null,
    responses: [],
    annotations: [],
    sebConfigUrl: null,
  };
}

export async function getAttemptScreenData(attemptId: string, includePackage: boolean): Promise<AttemptScreenData> {
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    return demoAttemptScreenData(attemptId, includePackage);
  }

  const supabase = await createSupabaseServerClient();
  const { data: attempt, error: attemptError } = await supabase.from("attempts").select("*").eq("id", attemptId).single();
  if (attemptError) throw attemptError;

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", attempt.assessment_id)
    .single();
  if (assessmentError) throw assessmentError;

  const state = await invokeEdgeFunctionServer<AttemptStateResponse>("get-attempt-state", { attempt_id: attemptId });
  const packageResult = includePackage && state.state !== "WAITING"
    ? await getReleasedPackageResult(attemptId, state.state_token)
    : { package: null, packageError: null };

  const { data: responses, error: responsesError } = await supabase
    .from("text_responses")
    .select("question_node_id, answer_text, saved_at")
    .eq("attempt_id", attemptId);
  if (responsesError) throw responsesError;

  const { data: annotations, error: annotationsError } = await supabase
    .from("submission_annotations")
    .select("question_node_id, annotation_type, body")
    .eq("attempt_id", attemptId)
    .eq("annotation_type", "student_flag");
  if (annotationsError) throw annotationsError;

  let sebConfigUrl: string | null = null;
  if (attempt.seb_config_path) {
    const { data } = await supabase.storage.from("assessment-sources").createSignedUrl(attempt.seb_config_path, 3600);
    sebConfigUrl = data?.signedUrl ?? null;
  }

  return {
    attempt: mapScreenAttempt(attempt, assessment, state),
    stateToken: state.state_token,
    package: packageResult.package,
    packageError: packageResult.packageError,
    responses: responses ?? [],
    annotations: annotations ?? [],
    sebConfigUrl,
  };
}

async function getReleasedPackageResult(attemptId: string, stateToken: string) {
  try {
    const head = await headers();
    const sebBrowserExamKeyHash = head.get("x-safeexambrowser-browserexamkeyhash");
    const sebConfigKeyHash = head.get("x-safeexambrowser-configkeyhash");

    const response = await invokeEdgeFunctionServer<AttemptPackageResponse>("get-attempt-package", {
      attempt_id: attemptId,
      state_token: stateToken,
      seb_browser_exam_key_hash: sebBrowserExamKeyHash,
      seb_config_key_hash: sebConfigKeyHash,
    });
    const parsed = normalizedPackageSchema.safeParse(response.assessment_package);
    if (!parsed.success) {
      console.error("Schema validation failed:", parsed.error.format());
      return { 
        package: null, 
        packageError: `Released package failed schema validation: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ")}` 
      };
    }
    return { package: parsed.data, packageError: null };
  } catch (error) {
    return {
      package: null,
      packageError: error instanceof Error ? error.message : "Exam content could not be loaded.",
    };
  }
}

function mapScreenAttempt(attempt: Attempt, assessment: Assessment, state: AttemptStateResponse): AttemptSummary {
  return {
    id: attempt.id,
    title: assessment.title,
    paper_code: assessment.paper_code,
    student: "",
    start_at_utc: attempt.start_at_utc,
    end_at_utc: attempt.end_at_utc,
    upload_deadline_at_utc: attempt.upload_deadline_at_utc,
    duration_seconds: attempt.duration_seconds,
    display_timezone: attempt.display_timezone,
    solutions_requested: attempt.solutions_requested,
    delivery_mode: attempt.delivery_mode,
    state: state.state,
    countdown_target_utc: state.countdown_target_utc,
    server_now_utc: state.server_now_utc,
    owner_profile_id: assessment.owner_profile_id,
    seb_config_path: attempt.seb_config_path,
  };
}
