import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function assertInstitutionAttemptAccess(
  supabase: SupabaseServerClient,
  attemptId: string,
  ownerProfileId: string,
) {
  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .select("id,assessment_id,assessment_version_id,assignee_profile_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) throw new Error("Attempt not found.");
  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id")
    .eq("id", attempt.assessment_id)
    .eq("owner_profile_id", ownerProfileId)
    .maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment) throw new Error("Attempt is outside this institution workspace.");
  return attempt;
}
