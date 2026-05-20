import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body =
  | {
      action: "log_incident";
      attempt_id: string;
      incident_type: string;
      description: string;
      severity?: "low" | "medium" | "high";
      affects_marking?: boolean;
      student_visible?: boolean;
    }
  | {
      action: "apply_accommodation";
      attempt_id: string;
      accommodation_type: string;
      extra_seconds?: number | null;
      reason: string;
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
      .select("*, assessments(owner_profile_id)")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments;
    if (assessment?.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    if (body.action === "log_incident") {
      if (!body.description?.trim()) return json({ error: "description is required" }, 400);
      const { data, error } = await admin
        .from("attempt_incidents")
        .insert({
          attempt_id: body.attempt_id,
          created_by_profile_id: ownerProfile.id,
          incident_type: body.incident_type,
          description: body.description.trim(),
          severity: body.severity ?? "low",
          affects_marking: body.affects_marking ?? false,
          student_visible: body.student_visible ?? false,
        })
        .select("*")
        .single();
      if (error) throw error;
      await auditOwnerAction(ownerProfile.id, user.id, "attempt_incident.logged", "attempt_incidents", data.id, { attempt_id: body.attempt_id });
      return json({ ok: true, incident: data });
    }

    if (!body.reason?.trim()) return json({ error: "reason is required" }, 400);
    const extraSeconds = Number(body.extra_seconds ?? 0);
    const { data, error } = await admin
      .from("attempt_accommodations")
      .insert({
        attempt_id: body.attempt_id,
        created_by_profile_id: ownerProfile.id,
        accommodation_type: body.accommodation_type,
        extra_seconds: Number.isFinite(extraSeconds) ? extraSeconds : null,
        reason: body.reason.trim(),
      })
      .select("*")
      .single();
    if (error) throw error;

    if (extraSeconds > 0 && (body.accommodation_type === "extra_time" || body.accommodation_type === "upload_extension" || body.accommodation_type === "manual_reopen_upload")) {
      const field = body.accommodation_type === "extra_time" ? "end_at_utc" : "upload_deadline_at_utc";
      const base = Date.parse(attempt[field] ?? attempt.upload_deadline_at_utc ?? attempt.end_at_utc);
      if (Number.isFinite(base)) {
        await admin.from("attempts").update({ [field]: new Date(base + extraSeconds * 1000).toISOString() }).eq("id", body.attempt_id);
      }
    }

    await auditOwnerAction(ownerProfile.id, user.id, "attempt_accommodation.applied", "attempt_accommodations", data.id, {
      attempt_id: body.attempt_id,
      accommodation_type: body.accommodation_type,
      extra_seconds: extraSeconds,
    });
    return json({ ok: true, accommodation: data });
  } catch (error) {
    return errorResponse(error, "attempt-intervention failed");
  }
});
