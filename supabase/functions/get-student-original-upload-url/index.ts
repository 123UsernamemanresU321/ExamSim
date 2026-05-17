import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string; upload_slot_id: string }>(request);
    if (!body.attempt_id || !body.upload_slot_id) return json({ error: "attempt_id and upload_slot_id are required" }, 400);

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id, assignee_profile_id")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    if (attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);

    const { data: feedbackRelease, error: feedbackError } = await admin
      .from("feedback_releases")
      .select("visible_to_student")
      .eq("attempt_id", attempt.id)
      .maybeSingle();
    if (feedbackError) throw feedbackError;
    if (!feedbackRelease?.visible_to_student) return json({ error: "Feedback has not been released for this attempt." }, 403);

    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("id, attempt_id, object_path")
      .eq("id", body.upload_slot_id)
      .eq("attempt_id", attempt.id)
      .single();
    if (slotError) throw slotError;
    if (!slot?.object_path) return json({ error: "Original upload is not available." }, 400);

    const { data: signed, error: signedError } = await admin.storage.from("answer-uploads").createSignedUrl(slot.object_path, 180);
    if (signedError) throw signedError;
    if (!signed?.signedUrl) throw new Error("Could not create original upload URL");

    await admin.from("attempt_events").insert({
      attempt_id: attempt.id,
      event_type: "student.original_upload_requested",
      payload_json: { upload_slot_id: slot.id },
    });

    return json({ signed_url: signed.signedUrl, expires_in_seconds: 180 });
  } catch (error) {
    return errorResponse(error, "get-student-original-upload-url failed");
  }
});
