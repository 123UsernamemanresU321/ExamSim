import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string }>(request);
    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", body.attempt_id).single();
    if (error) throw error;
    const [{ data: responses }, { data: slots }, { data: report }, { data: version }] = await Promise.all([
      admin.from("text_responses").select("*").eq("attempt_id", body.attempt_id),
      admin.from("upload_slots").select("*").eq("attempt_id", body.attempt_id),
      admin.from("moderation_reports").select("*").eq("attempt_id", body.attempt_id).maybeSingle(),
      admin.from("assessment_versions").select("normalized_package_json").eq("id", attempt.assessment_version_id).single(),
    ]);
    const packet = {
      attempt,
      assessment_package: version?.normalized_package_json,
      typed_responses: responses ?? [],
      upload_slots: slots ?? [],
      moderation_report: report,
      marking_packet_note: "This JSON bundle is owner-only. ZIP packaging can be layered over this signed packet response.",
    };
    await auditOwnerAction(ownerProfile.id, user.id, "marking_packet.exported", "attempts", body.attempt_id);
    return json(packet);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "owner-download-marking-packet failed" }, 401);
  }
});
