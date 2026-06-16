import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<{
      bucket: "assessment-sources" | "assessment-packages" | "answer-uploads" | "marking-packets";
      object_path: string;
      purpose: "assessment_source" | "parse_artifact" | "answer_upload" | "marking_packet";
      expires_in_seconds?: number;
    }>(request);
    if (!body.bucket || !body.object_path || !body.purpose) {
      return json(request, { error: "bucket, object_path, and purpose are required" }, 400);
    }
    if (!isSafeObjectPath(body.object_path)) return json(request, { error: "Invalid object path" }, 400);

    const allowed = await ownerCanAccessObject(admin, ownerProfile.id, body.bucket, body.object_path, body.purpose);
    if (!allowed) return json(request, { error: "Forbidden" }, 403);

    const expiresIn = Math.min(Math.max(body.expires_in_seconds ?? 300, 60), 900);
    const { data, error } = await admin.storage.from(body.bucket).createSignedUrl(body.object_path, expiresIn);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Could not create signed URL");

    await auditOwnerAction(ownerProfile.id, user.id, `storage_url.${body.purpose}`, null, null, {
      bucket: body.bucket,
      object_path: body.object_path,
      expires_in_seconds: expiresIn,
    });

    return json(request, { signed_url: data.signedUrl, expires_in_seconds: expiresIn });
  } catch (error) {
    return errorResponse(request, error, "owner-sign-storage-url failed");
  }
});

async function ownerCanAccessObject(
  admin: any,
  ownerProfileId: string,
  bucket: string,
  objectPath: string,
  purpose: string,
) {
  if (bucket === "answer-uploads" && purpose === "answer_upload") {
    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("attempt_id")
      .eq("object_path", objectPath)
      .maybeSingle();
    if (slotError) throw slotError;
    if (!slot?.attempt_id) return false;
    return ownerOwnsAttempt(admin, ownerProfileId, String(slot.attempt_id));
  }

  if (bucket === "assessment-sources" && purpose === "assessment_source") {
    const { data: sourceVersion, error: sourceVersionError } = await admin
      .from("assessment_versions")
      .select("assessment_id")
      .eq("source_object_path", objectPath)
      .maybeSingle();
    if (sourceVersionError) throw sourceVersionError;
    if (sourceVersion?.assessment_id) return ownerOwnsAssessment(admin, ownerProfileId, String(sourceVersion.assessment_id));

    const { data: markschemeVersion, error: markschemeVersionError } = await admin
      .from("assessment_versions")
      .select("assessment_id")
      .eq("markscheme_source_object_path", objectPath)
      .maybeSingle();
    if (markschemeVersionError) throw markschemeVersionError;
    if (!markschemeVersion?.assessment_id) return false;
    return ownerOwnsAssessment(admin, ownerProfileId, String(markschemeVersion.assessment_id));
  }

  if (bucket === "assessment-packages" && purpose === "parse_artifact") {
    const { data: artifact, error: artifactError } = await admin
      .from("parse_job_artifacts")
      .select("parse_job_id")
      .eq("object_path", objectPath)
      .maybeSingle();
    if (artifactError) throw artifactError;
    if (artifact?.parse_job_id) {
      const { data: job, error: jobError } = await admin
        .from("parse_jobs")
        .select("owner_profile_id")
        .eq("id", String(artifact.parse_job_id))
        .maybeSingle();
      if (jobError) throw jobError;
      if (job?.owner_profile_id === ownerProfileId) return true;
    }

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("assessment_id")
      .eq("normalized_package_path", objectPath)
      .maybeSingle();
    if (versionError) throw versionError;
    if (version?.assessment_id) return ownerOwnsAssessment(admin, ownerProfileId, String(version.assessment_id));

    const { data: assetNode, error: assetNodeError } = await admin
      .from("question_nodes")
      .select("assessment_version_id")
      .contains("assets", [objectPath])
      .limit(1)
      .maybeSingle();
    if (assetNodeError) throw assetNodeError;
    if (!assetNode?.assessment_version_id) {
      const { data: sourcePage, error: sourcePageError } = await admin
        .from("source_pages")
        .select("source_document_id")
        .eq("image_object_path", objectPath)
        .maybeSingle();
      if (sourcePageError) throw sourcePageError;
      if (!sourcePage?.source_document_id) return false;

      const { data: sourceDocument, error: sourceDocumentError } = await admin
        .from("source_documents")
        .select("owner_profile_id")
        .eq("id", String(sourcePage.source_document_id))
        .maybeSingle();
      if (sourceDocumentError) throw sourceDocumentError;
      return sourceDocument?.owner_profile_id === ownerProfileId;
    }

    const { data: assetVersion, error: assetVersionError } = await admin
      .from("assessment_versions")
      .select("assessment_id")
      .eq("id", String(assetNode.assessment_version_id))
      .maybeSingle();
    if (assetVersionError) throw assetVersionError;
    if (!assetVersion?.assessment_id) return false;
    return ownerOwnsAssessment(admin, ownerProfileId, String(assetVersion.assessment_id));
  }

  if (bucket === "marking-packets" && purpose === "marking_packet") {
    const { data, error } = await admin
      .from("marking_packet_exports")
      .select("owner_profile_id")
      .eq("object_path", objectPath)
      .maybeSingle();
    if (error) throw error;
    return data?.owner_profile_id === ownerProfileId;
  }

  return false;
}

async function ownerOwnsAttempt(admin: any, ownerProfileId: string, attemptId: string) {
  const { data: attempt, error: attemptError } = await admin
    .from("attempts")
    .select("assessment_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt?.assessment_id) return false;
  return ownerOwnsAssessment(admin, ownerProfileId, String(attempt.assessment_id));
}

async function ownerOwnsAssessment(admin: any, ownerProfileId: string, assessmentId: string) {
  const { data: assessment, error } = await admin
    .from("assessments")
    .select("owner_profile_id")
    .eq("id", assessmentId)
    .maybeSingle();
  if (error) throw error;
  return assessment?.owner_profile_id === ownerProfileId;
}

function isSafeObjectPath(path: string) {
  return Boolean(path.trim()) && !path.includes("..") && !path.startsWith("/") && !path.includes("\\");
}
