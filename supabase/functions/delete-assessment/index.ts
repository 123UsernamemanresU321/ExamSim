import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<{ assessment_id: string }>(request);
    if (!body.assessment_id) return json({ error: "assessment_id is required" }, 400);

    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .select("id,title,owner_profile_id")
      .eq("id", body.assessment_id)
      .single();
    if (assessmentError) throw assessmentError;
    if (assessment.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    const { data: versions, error: versionError } = await admin
      .from("assessment_versions")
      .select("id,source_object_path,normalized_package_path,encrypted_package_path")
      .eq("assessment_id", assessment.id);
    if (versionError) throw versionError;
    const versionIds = (versions ?? []).map((version) => version.id);

    const { data: parseJobs, error: parseJobError } = versionIds.length
      ? await admin.from("parse_jobs").select("id").in("assessment_version_id", versionIds)
      : { data: [], error: null };
    if (parseJobError) throw parseJobError;
    const parseJobIds = (parseJobs ?? []).map((job) => job.id);

    const { data: artifacts, error: artifactError } = parseJobIds.length
      ? await admin.from("parse_job_artifacts").select("object_path").in("parse_job_id", parseJobIds)
      : { data: [], error: null };
    if (artifactError) throw artifactError;

    const { data: attempts, error: attemptError } = await admin
      .from("attempts")
      .select("id")
      .eq("assessment_id", assessment.id);
    if (attemptError) throw attemptError;
    const attemptIds = (attempts ?? []).map((attempt) => attempt.id);

    const { data: uploadSlots, error: slotError } = attemptIds.length
      ? await admin.from("upload_slots").select("object_path").in("attempt_id", attemptIds)
      : { data: [], error: null };
    if (slotError) throw slotError;

    const { data: packetExports, error: exportError } = attemptIds.length
      ? await admin.from("marking_packet_exports").select("object_path").in("attempt_id", attemptIds)
      : { data: [], error: null };
    if (exportError) throw exportError;

    const packagePaths = compact([
      ...(versions ?? []).flatMap((version) => [version.normalized_package_path, version.encrypted_package_path]),
      ...(artifacts ?? []).map((artifact) => artifact.object_path),
    ]);
    const sourcePaths = compact((versions ?? []).map((version) => version.source_object_path));
    const answerPaths = compact((uploadSlots ?? []).map((slot) => slot.object_path));
    const packetPaths = compact((packetExports ?? []).map((packet) => packet.object_path));

    const storageWarnings = [
      ...(await removeObjects(admin, "assessment-sources", sourcePaths)),
      ...(await removeObjects(admin, "assessment-packages", packagePaths)),
      ...(await removeObjects(admin, "answer-uploads", answerPaths)),
      ...(await removeObjects(admin, "marking-packets", packetPaths)),
    ];

    const envelopePaths = [...packagePaths, ...packetPaths];
    if (envelopePaths.length) {
      await admin.from("encrypted_object_envelopes").delete().in("object_path", envelopePaths);
    }

    await auditOwnerAction(ownerProfile.id, user.id, "assessment.deleted", "assessments", assessment.id, {
      title: assessment.title,
      version_count: versionIds.length,
      attempt_count: attemptIds.length,
      storage_warnings: storageWarnings,
    });

    const { error: deleteError } = await admin.from("assessments").delete().eq("id", assessment.id);
    if (deleteError) throw deleteError;

    return json({
      ok: true,
      deleted_assessment_id: assessment.id,
      deleted_versions: versionIds.length,
      deleted_attempts: attemptIds.length,
      storage_warnings: storageWarnings,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "delete-assessment failed" }, 401);
  }
});

function compact(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function removeObjects(
  admin: {
    storage: {
      from(bucket: string): {
        remove(paths: string[]): Promise<{ error: Error | null }>;
      };
    };
  },
  bucket: string,
  paths: string[],
) {
  if (!paths.length) return [];
  const warnings: string[] = [];
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) warnings.push(`${bucket}: ${error.message}`);
  }
  return warnings;
}
