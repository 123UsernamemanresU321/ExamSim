import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

const MAX_SEB_CONFIG_BYTES = 1024 * 1024;

type Body = {
  assessment_id: string;
  version_id: string;
  file_name: string;
  content_base64: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.assessment_id || !body.version_id || !body.file_name || !body.content_base64) {
      return json({ error: "assessment_id, version_id, file_name, and content_base64 are required" }, 400);
    }
    if (!body.file_name.toLowerCase().endsWith(".seb")) return json({ error: "Only .seb configuration files are allowed" }, 400);

    const bytes = decodeBase64(body.content_base64);
    if (bytes.byteLength === 0) return json({ error: ".seb configuration file is empty" }, 400);
    if (bytes.byteLength > MAX_SEB_CONFIG_BYTES) return json({ error: ".seb configuration file must be 1MB or smaller" }, 400);

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("id, assessment_id")
      .eq("id", body.version_id)
      .single();
    if (versionError) throw versionError;
    if (version.assessment_id !== body.assessment_id) return json({ error: "Version does not belong to assessment" }, 400);

    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .select("owner_profile_id")
      .eq("id", body.assessment_id)
      .single();
    if (assessmentError) throw assessmentError;
    if (assessment.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    const objectPath = `${ownerProfile.id}/assessments/${body.assessment_id}/versions/${body.version_id}/seb/${crypto.randomUUID()}.seb`;
    const { error: uploadError } = await admin.storage.from("assessment-sources").upload(objectPath, bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    await auditOwnerAction(ownerProfile.id, user.id, "seb_config.uploaded", "assessment_versions", body.version_id, {
      assessment_id: body.assessment_id,
      object_path: objectPath,
      file_name: body.file_name,
      byte_length: bytes.byteLength,
    });

    return json({ seb_config_path: objectPath });
  } catch (error) {
    return errorResponse(error, "upload-seb-config failed");
  }
});

function decodeBase64(value: string) {
  const normalized = value.includes(",") ? value.split(",").pop() ?? "" : value;
  try {
    return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  } catch {
    throw new Error("Invalid base64 .seb configuration file");
  }
}
