import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    await enforceRateLimit(admin, { scope: "curriculum-source-upload:owner", key: ownerProfileId, limit: 30, windowSeconds: 3600 });
    const objectPath = `${ownerProfileId}/curriculum/${crypto.randomUUID()}.pdf`;
    const { data, error } = await admin.storage.from("curriculum-sources").createSignedUploadUrl(objectPath);
    if (error) throw error;
    await auditOwnerAction(ownerProfileId, user.id, "curriculum_source.upload_issued", "curriculum_source_documents", null, { object_path: objectPath });
    return json(request, { bucket: "curriculum-sources", object_path: objectPath, upload_token: data.token, max_file_size_bytes: 50 * 1024 * 1024 });
  } catch (error) {
    return errorResponse(request, error, "curriculum source upload issue failed");
  }
});
