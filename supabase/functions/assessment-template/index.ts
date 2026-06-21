import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  action: "upsert" | "delete";
  id?: string;
  name?: string;
  description?: string | null;
  assessment_kind?: string;
  default_duration_seconds?: number;
  default_upload_grace_seconds?: number | null;
  delivery_mode?: string;
  solutions_requested?: boolean;
  typed_enabled?: boolean;
  per_question_upload_enabled?: boolean;
  require_blank_for_skipped?: boolean;
  policy_json?: Record<string, unknown>;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    const body = await readJson<Body>(request);
    if (body.action === "delete") {
      if (!body.id) return json({ error: "id is required" }, 400);
      const { error } = await admin.from("assessment_templates").delete().eq("id", body.id).eq("owner_profile_id", ownerProfileId);
      if (error) throw error;
      await auditOwnerAction(ownerProfileId, user.id, "assessment_template.deleted", "assessment_templates", body.id);
      return json({ ok: true });
    }
    if (!body.name?.trim()) return json({ error: "name is required" }, 400);
    const payload = {
      owner_profile_id: ownerProfileId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      assessment_kind: body.assessment_kind ?? "test",
      default_duration_seconds: Number(body.default_duration_seconds ?? 3600),
      default_upload_grace_seconds: body.default_upload_grace_seconds ?? null,
      delivery_mode: body.delivery_mode ?? "browser",
      solutions_requested: body.solutions_requested ?? true,
      typed_enabled: body.typed_enabled ?? false,
      per_question_upload_enabled: body.per_question_upload_enabled ?? true,
      require_blank_for_skipped: body.require_blank_for_skipped ?? true,
      policy_json: body.policy_json ?? {},
      updated_at: new Date().toISOString(),
    };
    const query = body.id
      ? admin.from("assessment_templates").update(payload).eq("id", body.id).eq("owner_profile_id", ownerProfileId)
      : admin.from("assessment_templates").insert(payload);
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    await auditOwnerAction(ownerProfileId, user.id, body.id ? "assessment_template.updated" : "assessment_template.created", "assessment_templates", data.id);
    return json({ ok: true, template: data });
  } catch (error) {
    return errorResponse(error, "assessment-template failed");
  }
});
