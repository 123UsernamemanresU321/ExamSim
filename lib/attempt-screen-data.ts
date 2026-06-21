
import { normalizedPackageSchema, type NormalizedAssessmentPackage } from "@/lib/assessment-package";
import { attemptWithState, samplePackage } from "@/lib/demo-data";
import { invokeEdgeFunctionServer } from "@/lib/edge/server";
import { DEFAULT_STUDENT_ACCOMMODATIONS, type StudentAccommodationPolicy } from "@/lib/examsim/accommodations";
import type { AttemptSummary } from "@/lib/live-data";
import { isDemoModeEnabled } from "@/lib/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Assessment, Attempt, UploadSlot } from "@/types/database";

type AttemptStateResponse = {
  attempt_id: string;
  state: AttemptSummary["state"];
  server_now_utc: string;
  display_timezone: string;
  countdown_target_utc: string | null;
  delivery_mode: string;
  solutions_requested: boolean;
  state_token: string;
  accommodation_policy: StudentAccommodationPolicy;
};

type AttemptPackageResponse = {
  attempt_id: string;
  state: AttemptSummary["state"];
  assessment_package: unknown;
  asset_urls?: Record<string, string>;
};

export type AttemptScreenData = {
  attempt: AttemptSummary;
  stateToken: string;
  package: NormalizedAssessmentPackage | null;
  assetUrls: Record<string, string>;
  packageError: string | null;
  responses: { question_node_id: string; answer_text: string; saved_at: string }[];
  annotations: { question_node_id: string | null; annotation_type: string; body: string }[];
  uploadSlots: UploadSlot[];
  sebConfigUrl: string | null;
  accommodationPolicy: StudentAccommodationPolicy;
};

function demoAttemptScreenData(attemptId: string, includePackage: boolean): AttemptScreenData {
  const attempt = attemptWithState(attemptId);
  const accommodationPolicy = attemptId === "att_active"
    ? {
        ...DEFAULT_STUDENT_ACCOMMODATIONS,
        calculator_policy: "graphing" as const,
        tts_allowed: true,
        desmos_allowed: true,
        geogebra_allowed: true,
        chemistry_editor_allowed: true,
      }
    : DEFAULT_STUDENT_ACCOMMODATIONS;
  return {
    attempt: {
      id: attempt.id,
      title: attempt.title,
      paper_code: attempt.paper_code ?? null,
      subject: "Olympiad",
      assessment_kind: "exam",
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
      seb_config_url: null,
    },
    stateToken: "demo-state-token",
    package: includePackage && attempt.state !== "WAITING" ? samplePackage : null,
    assetUrls: {},
    packageError: null,
    responses: [],
    annotations: [],
    uploadSlots: [],
    sebConfigUrl: null,
    accommodationPolicy,
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
  const packageResult = includePackage && state.state !== "WAITING" && state.state !== "PAUSED"
    ? await getReleasedPackageResult(attemptId, state.state_token)
    : { package: null, assetUrls: {}, packageError: null };

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

  const { data: uploadSlots, error: uploadSlotsError } = await supabase
    .from("upload_slots")
    .select("*")
    .eq("attempt_id", attemptId);
  if (uploadSlotsError) throw uploadSlotsError;

  let sebConfigUrl: string | null = null;
  if (attempt.seb_config_path) {
    const { data } = await supabase.storage.from("assessment-sources").createSignedUrl(attempt.seb_config_path, 3600);
    sebConfigUrl = data?.signedUrl ?? null;
  }

  return {
    attempt: mapScreenAttempt(attempt, assessment, state),
    stateToken: state.state_token,
    package: packageResult.package,
    assetUrls: packageResult.assetUrls,
    packageError: packageResult.packageError,
    responses: responses ?? [],
    annotations: annotations ?? [],
    uploadSlots: uploadSlots ?? [],
    sebConfigUrl,
    accommodationPolicy: state.accommodation_policy ?? DEFAULT_STUDENT_ACCOMMODATIONS,
  };
}

async function getReleasedPackageResult(attemptId: string, stateToken: string) {
  try {
    const response = await invokeEdgeFunctionServer<AttemptPackageResponse>("get-attempt-package", {
      attempt_id: attemptId,
      state_token: stateToken,
    });
    const parsed = normalizedPackageSchema.safeParse(response.assessment_package);
    if (!parsed.success) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Schema validation failed:", parsed.error.format());
      }
      return { 
      package: null,
      assetUrls: {},
      packageError: `Released package failed schema validation: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
      };
    }
    return { package: parsed.data, assetUrls: response.asset_urls ?? {}, packageError: null };
  } catch (error) {
    return {
      package: null,
      assetUrls: {},
      packageError: error instanceof Error ? error.message : "Exam content could not be loaded.",
    };
  }
}

function mapScreenAttempt(attempt: Attempt, assessment: Assessment, state: AttemptStateResponse): AttemptSummary {
  return {
    id: attempt.id,
    title: assessment.title,
    paper_code: assessment.paper_code,
    subject: assessment.subject,
    assessment_kind: assessment.assessment_kind,
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
    seb_config_url: null,
  };
}
