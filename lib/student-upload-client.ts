import type { SupabaseClient } from "@supabase/supabase-js";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { validatePdfUpload } from "@/lib/upload-policy";

type UploadSlotUrl = {
  bucket: string;
  path: string;
  upload_token: string;
  question_node_id: string;
};

export type StudentUploadCompletion = {
  questionNodeId: string;
  objectPath: string;
  fileName: string;
  fileSizeBytes: number;
  contentType: string;
  uploadedAt: string;
};

export async function uploadStudentPdfForQuestion({
  supabase,
  attemptId,
  questionNodeId,
  questionKey,
  stateToken,
  file,
}: {
  supabase: SupabaseClient;
  attemptId: string;
  questionNodeId: string;
  questionKey: string;
  stateToken: string;
  file: File;
}): Promise<StudentUploadCompletion> {
  const validation = validatePdfUpload(file);
  if (!validation.ok) throw new Error(validation.error ?? "Upload failed validation.");

  const slot = await invokeEdgeFunction<UploadSlotUrl>(supabase, "issue-upload-slot-url", {
    body: { attempt_id: attemptId, question_node_id: questionNodeId, question_node_key: questionKey, state_token: stateToken },
  });
  if (!slot) throw new Error("Could not issue upload URL.");

  const contentType = file.type || "application/pdf";
  const { error: uploadError } = await supabase.storage
    .from(slot.bucket)
    .uploadToSignedUrl(slot.path, slot.upload_token, file, { contentType });
  if (uploadError) throw new Error(uploadError.message);

  await invokeEdgeFunction(supabase, "confirm-upload-slot", {
    body: {
      attempt_id: attemptId,
      question_node_id: slot.question_node_id,
      object_path: slot.path,
      state_token: stateToken,
      file_size_bytes: file.size,
      content_type: contentType,
      file_name: file.name,
    },
  });

  return {
    questionNodeId: slot.question_node_id,
    objectPath: slot.path,
    fileName: file.name,
    fileSizeBytes: file.size,
    contentType,
    uploadedAt: new Date().toISOString(),
  };
}
