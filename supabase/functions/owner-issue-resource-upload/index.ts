import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    await enforceRateLimit(admin, {
      scope: "owner-resource-upload:owner",
      key: ownerProfileId,
      limit: 60,
      windowSeconds: 3600,
    });
    const objectPath = `${ownerProfileId}/resources/${crypto.randomUUID()}.pdf`;
    const { data, error } = await admin.storage.from("assessment-resources").createSignedUploadUrl(objectPath);
    if (error) throw error;
    await auditOwnerAction(ownerProfileId, user.id, "resource_library.upload_issued", "resource_library_items", null, {
      object_path: objectPath,
    });
    return json(request, {
      bucket: "assessment-resources",
      object_path: objectPath,
      upload_token: data.token,
      max_file_size_bytes: 50 * 1024 * 1024,
    });
  } catch (error) {
    return errorResponse(request, error, "resource upload issue failed");
  }
});
