import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { getAnonClient } from "../_shared/supabase.ts";

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
    const { user, jwt, admin, profile, ownerProfileId } = await requireInstitutionAal2(request, "invigilation");
    const body = await readJson<Body>(request);
    if (!body.attempt_id) return json(request, { error: "attempt_id is required" }, 400);
    if (body.action !== "log_incident" && body.action !== "apply_accommodation") {
      return json(request, { error: "Unsupported intervention action" }, 400);
    }
    await enforceRateLimit(admin, {
      scope: "attempt-intervention:actor",
      key: profile.id,
      limit: 300,
      windowSeconds: 3600,
    });

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("*, assessments(owner_profile_id)")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments;
    assertInstitutionOwner(assessment?.owner_profile_id, ownerProfileId);

    if (body.action === "log_incident") {
      const incidentTypes = ["internet_issue", "power_cut", "wrong_upload", "medical", "browser_crash", "admin_note", "other"];
      if (!incidentTypes.includes(body.incident_type)) return json(request, { error: "Unsupported incident type" }, 400);
      const description = body.description?.trim();
      if (!description) return json(request, { error: "description is required" }, 400);
      if (description.length > 4000) return json(request, { error: "description is too long" }, 400);
      const { data, error } = await admin
        .from("attempt_incidents")
        .insert({
          attempt_id: body.attempt_id,
          created_by_profile_id: profile.id,
          incident_type: body.incident_type,
          description,
          severity: body.severity ?? "low",
          affects_marking: body.affects_marking ?? false,
          student_visible: body.student_visible ?? false,
        })
        .select("*")
        .single();
      if (error) throw error;
      await auditOwnerAction(ownerProfileId, user.id, "attempt_incident.logged", "attempt_incidents", data.id, { attempt_id: body.attempt_id });
      return json(request, { ok: true, incident: data });
    }

    const supportedTypes = ["extra_time", "upload_extension", "manual_reopen_upload"];
    if (!supportedTypes.includes(body.accommodation_type)) {
      return json(request, { error: "Unsupported accommodation type" }, 400);
    }
    const reason = body.reason?.trim();
    if (!reason) return json(request, { error: "reason is required" }, 400);
    if (reason.length > 1000) return json(request, { error: "reason is too long" }, 400);
    const extraSeconds = Number(body.extra_seconds ?? 0);
    if (!Number.isInteger(extraSeconds) || extraSeconds < 60 || extraSeconds > 7200) {
      return json(request, { error: "Accommodation time must be between 1 and 120 minutes" }, 400);
    }
    const userClient = getAnonClient(jwt);
    const { data, error } = await userClient.rpc("institution_apply_attempt_accommodation", {
      p_owner_profile_id: ownerProfileId,
      p_attempt_id: body.attempt_id,
      p_accommodation_type: body.accommodation_type,
      p_extra_seconds: extraSeconds,
      p_reason: reason,
    });
    if (error) throw error;

    await auditOwnerAction(ownerProfileId, user.id, "attempt_accommodation.applied", "attempt_accommodations", String(data?.accommodation_id ?? ""), {
      attempt_id: body.attempt_id,
      accommodation_type: body.accommodation_type,
      extra_seconds: extraSeconds,
    });
    return json(request, { ok: true, accommodation: data });
  } catch (error) {
    return errorResponse(request, error, "attempt-intervention failed");
  }
});
