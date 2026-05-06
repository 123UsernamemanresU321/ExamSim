import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string; summary_text?: string; visible_to_student?: boolean }>(request);
    if (!body.attempt_id) return json({ error: "attempt_id is required" }, 400);

    const [{ data: marks, error: marksError }, { data: attempt, error: attemptError }] = await Promise.all([
      admin.from("marks").select("awarded_marks").eq("attempt_id", body.attempt_id),
      admin.from("attempts").select("assessment_version_id").eq("id", body.attempt_id).single(),
    ]);
    if (marksError) throw marksError;
    if (attemptError) throw attemptError;

    const { data: rubrics, error: rubricsError } = await admin
      .from("rubrics")
      .select("id")
      .eq("assessment_version_id", attempt.assessment_version_id);
    if (rubricsError) throw rubricsError;

    const rubricIds = (rubrics ?? []).map((rubric) => rubric.id);
    const { data: criteria, error: criteriaError } = rubricIds.length > 0
      ? await admin.from("rubric_criteria").select("max_marks").in("rubric_id", rubricIds)
      : { data: [], error: null };
    if (criteriaError) throw criteriaError;

    const totalAwarded = (marks ?? []).reduce((sum, mark) => sum + Number(mark.awarded_marks || 0), 0);
    const totalAvailable = (criteria ?? []).reduce(
      (sum, criterion) => sum + Number(criterion.max_marks || 0),
      0,
    );

    const { data: release, error: releaseError } = await admin
      .from("feedback_releases")
      .upsert(
        {
          attempt_id: body.attempt_id,
          released_by_profile_id: ownerProfile.id,
          summary_text: body.summary_text?.trim() || null,
          total_awarded_marks: totalAwarded,
          total_available_marks: totalAvailable,
          visible_to_student: body.visible_to_student ?? true,
          released_at: new Date().toISOString(),
        },
        { onConflict: "attempt_id" },
      )
      .select("*")
      .single();
    if (releaseError) throw releaseError;

    await auditOwnerAction(ownerProfile.id, user.id, "feedback.released", "attempts", body.attempt_id, {
      total_awarded_marks: totalAwarded,
      total_available_marks: totalAvailable,
    });

    return json({ ok: true, release });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "release-feedback failed" }, 401);
  }
});
