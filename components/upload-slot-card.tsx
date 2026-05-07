"use client";

import { useRef, useState } from "react";
import { FileUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { uploadSizeLabel, validatePdfUpload } from "@/lib/upload-policy";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

type UploadSlotUrl = {
  bucket: string;
  path: string;
  upload_token: string;
  question_node_id: string;
};

export function UploadSlotCard({
  attemptId,
  questionNodeId,
  questionKey,
  stateToken,
  status,
  disabled = false,
}: {
  attemptId?: string;
  questionNodeId?: string;
  questionKey: string;
  stateToken?: string;
  status: "pending" | "uploaded" | "blank_placeholder" | "missing";
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isLocked = disabled || currentStatus === "uploaded" || currentStatus === "blank_placeholder";

  async function uploadFile(file: File) {
    const validation = validatePdfUpload(file);
    if (!validation.ok) {
      setMessage(validation.error ?? "Upload failed validation.");
      return;
    }
    if (!attemptId || !questionNodeId || !stateToken) {
      setMessage("Upload requires a fresh server state token. Refresh the attempt state.");
      return;
    }

    setIsUploading(true);
    setMessage("Requesting one-time upload slot...");
    const supabase = createSupabaseBrowserClient();
    let slot: UploadSlotUrl | null = null;
    try {
      slot = await invokeEdgeFunction<UploadSlotUrl>(supabase, "issue-upload-slot-url", {
        body: { attempt_id: attemptId, question_node_id: questionNodeId, question_node_key: questionKey, state_token: stateToken },
      });
    } catch (error) {
      setIsUploading(false);
      setMessage(error instanceof Error ? error.message : "Could not issue upload URL.");
      return;
    }
    if (!slot) {
      setIsUploading(false);
      setMessage("Could not issue upload URL.");
      return;
    }

    setMessage("Uploading PDF...");
    const { error: uploadError } = await supabase.storage
      .from(slot.bucket)
      .uploadToSignedUrl(slot.path, slot.upload_token, file, {
        contentType: file.type || "application/pdf",
      });
    if (uploadError) {
      setIsUploading(false);
      setMessage(uploadError.message);
      return;
    }

    setIsUploading(false);
    try {
      await invokeEdgeFunction(supabase, "confirm-upload-slot", {
        body: {
          attempt_id: attemptId,
          question_node_id: slot.question_node_id,
          object_path: slot.path,
          state_token: stateToken,
          file_size_bytes: file.size,
          content_type: file.type || "application/pdf",
        },
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not confirm upload.");
      return;
    }
    setCurrentStatus("uploaded");
    setMessage("PDF uploaded and locked for this slot.");
  }

  async function submitBlank() {
    if (!attemptId || !questionNodeId || !stateToken) {
      setMessage("Blank submission requires a fresh server state token. Refresh the attempt state.");
      return;
    }
    setIsUploading(true);
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "submit-blank-slot", {
        body: { attempt_id: attemptId, question_node_id: questionNodeId, question_node_key: questionKey, state_token: stateToken },
      });
      setCurrentStatus("blank_placeholder");
      setMessage("Blank placeholder submitted and locked for this slot.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit blank placeholder.");
      return;
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 shadow-none">
      <div>
        <p className="text-sm font-semibold text-[var(--ink)]">Question {questionKey}</p>
        <p className="text-sm text-[var(--muted)]">Status: {currentStatus.replace("_", " ")}</p>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          One PDF only, max {uploadSizeLabel()}. If this covers subquestions, label each subquestion clearly inside the PDF.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void uploadFile(file);
            event.currentTarget.value = "";
          }}
        />
        <Button type="button" variant="secondary" disabled={isLocked || isUploading} onClick={() => inputRef.current?.click()}>
          <FileUp size={16} aria-hidden="true" />
          Upload PDF
        </Button>
        <Button type="button" variant="ghost" disabled={isLocked || isUploading} onClick={() => void submitBlank()}>
          <Square size={16} aria-hidden="true" />
          Submit blank
        </Button>
      </div>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </Card>
  );
}
