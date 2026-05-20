import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  attempt_id: string;
  action_type: "repair_upload_metadata" | "grant_upload_extension" | "owner_replace_upload" | "mark_resolved" | "log_note";
  upload_slot_id?: string | null;
  extra_seconds?: number | null;
  details?: Record<string, unknown>;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.attempt_id) return json({ error: "attempt_id is required" }, 400);

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id, upload_deadline_at_utc, assessments(owner_profile_id)")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments;
    if (assessment?.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    if (body.action_type === "grant_upload_extension" && Number(body.extra_seconds ?? 0) > 0) {
      const base = Date.parse(attempt.upload_deadline_at_utc ?? new Date().toISOString());
      await admin.from("attempts").update({ upload_deadline_at_utc: new Date(base + Number(body.extra_seconds) * 1000).toISOString() }).eq("id", body.attempt_id);
      await admin.from("attempt_accommodations").insert({
        attempt_id: body.attempt_id,
        created_by_profile_id: ownerProfile.id,
        accommodation_type: "upload_extension",
        extra_seconds: body.extra_seconds,
        reason: "Attempt Recovery Center upload extension",
      });
    }

    const { data, error } = await admin
      .from("attempt_recovery_actions")
      .insert({
        attempt_id: body.attempt_id,
        owner_profile_id: ownerProfile.id,
        action_type: body.action_type,
        upload_slot_id: body.upload_slot_id ?? null,
        details_json: body.details ?? {},
      })
      .select("*")
      .single();
    if (error) throw error;

    await admin.from("attempt_incidents").insert({
      attempt_id: body.attempt_id,
      created_by_profile_id: ownerProfile.id,
      incident_type: "admin_note",
      description: `Recovery action: ${body.action_type}`,
      severity: "low",
      affects_marking: true,
    });
    await auditOwnerAction(ownerProfile.id, user.id, "attempt_recovery.action", "attempt_recovery_actions", data.id, { action_type: body.action_type });
    return json({ ok: true, action: data });
  } catch (error) {
    return errorResponse(error, "attempt-recovery failed");
  }
});
