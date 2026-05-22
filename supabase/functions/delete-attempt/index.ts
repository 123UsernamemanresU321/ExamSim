import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  attempt_id: string;
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
      .select("id, assessment_id, assignee_profile_id, assessments(id,title,owner_profile_id)")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments;
    if (!assessment || assessment.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    const { data: uploadSlots, error: slotError } = await admin
      .from("upload_slots")
      .select("id, object_path, annotated_object_path")
      .eq("attempt_id", attempt.id);
    if (slotError) throw slotError;
    const uploadSlotIds = (uploadSlots ?? []).map((slot) => slot.id);

    const { data: uploadChecks, error: checkError } = uploadSlotIds.length
      ? await admin.from("upload_sanity_checks").select("preview_object_path").in("upload_slot_id", uploadSlotIds)
      : { data: [], error: null };
    if (checkError) throw checkError;

    const { data: packetExports, error: packetError } = await admin
      .from("marking_packet_exports")
      .select("object_path")
      .eq("attempt_id", attempt.id);
    if (packetError) throw packetError;

    const { data: notebooks, error: notebookError } = await admin
      .from("correction_notebooks")
      .select("id")
      .eq("attempt_id", attempt.id);
    if (notebookError) throw notebookError;
    const notebookIds = (notebooks ?? []).map((notebook) => notebook.id);
    const { data: correctionEntries, error: correctionEntryError } = notebookIds.length
      ? await admin.from("correction_entries").select("corrected_upload_object_path").in("notebook_id", notebookIds)
      : { data: [], error: null };
    if (correctionEntryError) throw correctionEntryError;

    const answerUploadPaths = compact([
      ...(uploadSlots ?? []).map((slot) => slot.object_path),
      ...(correctionEntries ?? []).map((entry) => entry.corrected_upload_object_path),
    ]);
    const markingPacketPaths = compact([
      ...(uploadSlots ?? []).map((slot) => slot.annotated_object_path),
      ...(packetExports ?? []).map((packet) => packet.object_path),
      ...(uploadChecks ?? []).map((check) => check.preview_object_path),
    ]);

    const storageWarnings: string[] = [];
    for (let index = 0; index < answerUploadPaths.length; index += 100) {
      const batch = answerUploadPaths.slice(index, index + 100);
      const { error } = await admin.storage.from("answer-uploads").remove(batch);
      if (error) storageWarnings.push(`answer-uploads: ${error.message}`);
    }
    for (let index = 0; index < markingPacketPaths.length; index += 100) {
      const batch = markingPacketPaths.slice(index, index + 100);
      const { error } = await admin.storage.from("marking-packets").remove(batch);
      if (error) storageWarnings.push(`marking-packets: ${error.message}`);
    }

    const envelopePaths = [...markingPacketPaths];
    if (envelopePaths.length) {
      await admin.from("encrypted_object_envelopes").delete().in("object_path", envelopePaths);
    }

    await auditOwnerAction(ownerProfile.id, user.id, "attempt.deleted", "attempts", attempt.id, {
      assessment_id: attempt.assessment_id,
      assessment_title: assessment.title,
      assignee_profile_id: attempt.assignee_profile_id,
      upload_object_count: answerUploadPaths.length,
      marking_packet_object_count: markingPacketPaths.length,
      storage_warnings: storageWarnings,
    });

    const { error: deleteError } = await admin.from("attempts").delete().eq("id", attempt.id);
    if (deleteError) throw deleteError;

    return json({
      ok: true,
      deleted_attempt_id: attempt.id,
      storage_warnings: storageWarnings,
    });
  } catch (error) {
    return errorResponse(error, "delete-attempt failed");
  }
});

function compact(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
