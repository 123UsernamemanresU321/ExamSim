import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireOwner } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  assessment_id: string;
  version_id: string;
  start_at_local: string;
  display_timezone: string;
  duration_seconds: number;
  delivery_mode: "browser" | "seb_required";
  solutions_requested: boolean;
  upload_only_grace_seconds?: number;
  assigned_profile_ids: string[];
  typed_enabled?: boolean;
  per_question_upload_enabled?: boolean;
  require_blank_for_skipped?: boolean;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { admin } = await requireOwner(request);
    const body = await readJson<Body>(request);
    if (!body.assessment_id || !body.version_id || !body.start_at_local || !body.assigned_profile_ids?.length) {
      return json({ error: "Missing publish fields" }, 400);
    }
    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("*")
      .eq("id", body.version_id)
      .single();
    if (versionError) throw versionError;
    if (version.requires_owner_review) return json({ error: "Owner review is required before publish" }, 400);

    const start = new Date(body.start_at_local);
    const end = new Date(start.getTime() + body.duration_seconds * 1000);
    const uploadDeadline =
      body.solutions_requested && body.upload_only_grace_seconds
        ? new Date(end.getTime() + body.upload_only_grace_seconds * 1000).toISOString()
        : null;

    const { error: publishError } = await admin
      .from("assessment_versions")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", body.version_id);
    if (publishError) throw publishError;

    const rows = body.assigned_profile_ids.map((profileId) => ({
      assessment_id: body.assessment_id,
      assessment_version_id: body.version_id,
      assignee_profile_id: profileId,
      start_at_utc: start.toISOString(),
      duration_seconds: body.duration_seconds,
      end_at_utc: end.toISOString(),
      upload_deadline_at_utc: uploadDeadline,
      display_timezone: body.display_timezone || "Africa/Johannesburg",
      delivery_mode: body.delivery_mode,
      solutions_requested: body.solutions_requested,
      typed_enabled: body.typed_enabled ?? true,
      per_question_upload_enabled: body.per_question_upload_enabled ?? true,
      require_blank_for_skipped: body.require_blank_for_skipped ?? false,
    }));
    const { data: attempts, error: attemptError } = await admin.from("attempts").insert(rows).select("id");
    if (attemptError) throw attemptError;
    for (const attempt of attempts ?? []) {
      if (body.per_question_upload_enabled ?? true) {
        await admin.rpc("create_upload_slots_for_attempt", { target_attempt_id: attempt.id });
      }
    }
    return json({ ok: true, attempt_ids: attempts?.map((attempt) => attempt.id) ?? [] });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "publish-assessment failed" }, 401);
  }
});
