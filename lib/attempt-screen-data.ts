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
    },
    stateToken: "demo-state-token",
    package: includePackage && attempt.state !== "WAITING" ? samplePackage : null,
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
  const assessmentPackage = includePackage && state.state !== "WAITING"
    ? await getReleasedPackage(attemptId, state.state_token)
    : null;

  return {
    attempt: mapScreenAttempt(attempt, assessment, state),
    stateToken: state.state_token,
    package: assessmentPackage,
  };
}

async function getReleasedPackage(attemptId: string, stateToken: string) {
  const response = await invokeEdgeFunctionServer<AttemptPackageResponse>("get-attempt-package", {
    attempt_id: attemptId,
    state_token: stateToken,
  });
  const parsed = normalizedPackageSchema.safeParse(response.assessment_package);
  if (!parsed.success) throw new Error("Released package failed schema validation");
  return parsed.data;
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
  };
}
