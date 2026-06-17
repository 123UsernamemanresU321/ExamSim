"use client";

import { useActionState, useRef, useState } from "react";
import { FileUp, RotateCcw } from "lucide-react";
import { uploadPdfSourceAction, type PdfSourceUploadState } from "@/app/owner/assessments/[id]/authoring/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { uploadSizeLabel } from "@/lib/upload-policy";

const INITIAL_STATE: PdfSourceUploadState = {
  status: "idle",
  message: "Upload a question paper PDF to create source pages for the region editor.",
};

export function PdfSourceUploadPanel({
  assessmentId,
  versionId,
  compact = false,
}: {
  assessmentId: string;
  versionId: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(uploadPdfSourceAction.bind(null, assessmentId, versionId), INITIAL_STATE);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const submitPdfSource = (formData: FormData) => {
    setSelectedFile("");
    formRef.current?.reset();
    formAction(formData);
  };

  return (
    <form
      ref={formRef}
      action={submitPdfSource}
      className={compact ? "grid gap-3" : "rounded-[4px] border border-[var(--border)] bg-white p-4"}
    >
      <div className={compact ? "grid gap-2" : "grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"}>
        <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          Upload PDF Source
          <Input
            name="pdf_source"
            type="file"
            accept="application/pdf,.pdf"
            required
            onChange={(event) => setSelectedFile(event.currentTarget.files?.[0]?.name ?? "")}
          />
        </label>
        <Button type="submit" disabled={pending} className="md:self-end">
          {pending ? <RotateCcw size={14} className="animate-spin" aria-hidden="true" /> : <FileUp size={14} aria-hidden="true" />}
          {pending ? "Uploading and extracting pages..." : "Upload PDF Source"}
        </Button>
      </div>
      <div className="mt-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--muted)]" role="status">
        {pending ? (
          <p>Uploading securely, validating PDF bytes, and creating source page records. Keep this page open.</p>
        ) : state.status === "success" ? (
          <p className="font-semibold text-[var(--success)]">{state.message}</p>
        ) : state.status === "error" ? (
          <p className="font-semibold text-[var(--danger)]">{state.message}</p>
        ) : (
          <p>{selectedFile ? `Ready to upload ${selectedFile}.` : `PDF only, maximum ${uploadSizeLabel()}. The file stays in the private assessment-sources bucket.`}</p>
        )}
      </div>
    </form>
  );
}
