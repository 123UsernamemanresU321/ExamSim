"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { uploadSizeLabel } from "@/lib/upload-policy";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { uploadStudentPdfForQuestion, type StudentUploadCompletion } from "@/lib/student-upload-client";
import type { UploadSlot } from "@/types/database";

export function UploadSlotCard({
  attemptId,
  questionNodeId,
  questionKey,
  stateToken,
  status = "pending",
  slot,
  disabled = false,
  onUploadComplete,
}: {
  attemptId?: string;
  questionNodeId?: string;
  questionKey: string;
  stateToken?: string;
  status?: UploadSlot["status"];
  slot?: Pick<UploadSlot, "status" | "object_path" | "uploaded_at" | "file_size_bytes" | "locked_at" | "original_file_name"> | null;
  disabled?: boolean;
  onUploadComplete?: (completion: StudentUploadCompletion) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localStatus, setLocalStatus] = useState<UploadSlot["status"] | null>(null);
  const [localUpload, setLocalUpload] = useState<StudentUploadCompletion | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const currentStatus = localStatus ?? (localUpload ? "uploaded" : slot?.status ?? status);
  const uploadedFileName = localUpload?.fileName ?? slot?.original_file_name ?? "";
  const uploadedFileSize = localUpload?.fileSizeBytes ?? slot?.file_size_bytes ?? null;
  const uploadedAt = localUpload?.uploadedAt ?? slot?.uploaded_at ?? null;
  const isLocked = disabled || currentStatus === "uploaded" || currentStatus === "blank_placeholder";

  async function uploadFile(file: File) {
    if (!attemptId || !questionNodeId || !stateToken) {
      setMessage("Upload requires a fresh server state token. Refresh the attempt state.");
      return;
    }

    setIsUploading(true);
    setMessage("Requesting one-time upload slot...");
    const supabase = createSupabaseBrowserClient();
    try {
      const completion = await uploadStudentPdfForQuestion({
        supabase,
        attemptId,
        questionNodeId,
        questionKey,
        stateToken,
        file,
      });
      setLocalStatus("uploaded");
      setLocalUpload(completion);
      setMessage("PDF uploaded and locked for this slot.");
      onUploadComplete?.(completion);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
      return;
    } finally {
      setIsUploading(false);
    }
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
      setLocalStatus("blank_placeholder");
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Question {questionKey}</p>
            <p className="text-sm text-[var(--muted)]">Status: {currentStatus.replace("_", " ")}</p>
          </div>
          {currentStatus === "uploaded" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#78a86d] bg-[var(--success-bg)] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[#123d18]">
              <CheckCircle2 size={12} /> Uploaded
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          One PDF only, max {uploadSizeLabel()}. If this covers subquestions, label each subquestion clearly inside the PDF.
        </p>
        {uploadedFileName ? (
          <div className="mt-3 rounded-md border border-[#78a86d] bg-[var(--success-bg)] p-3 text-xs leading-5 text-[#123d18]">
            <p className="font-bold">Uploaded file: {uploadedFileName}</p>
            <p>
              {uploadedFileSize ? `${formatBytes(uploadedFileSize)} · ` : ""}
              {uploadedAt ? `Confirmed ${new Date(uploadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Confirmed"}
            </p>
          </div>
        ) : null}
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
          {isUploading ? "Uploading..." : currentStatus === "uploaded" ? "Uploaded - locked" : "Upload PDF"}
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

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}
