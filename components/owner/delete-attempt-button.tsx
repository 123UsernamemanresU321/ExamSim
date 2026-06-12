"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DangerMenu, DangerMenuItem } from "@/components/ui/danger-menu";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function DeleteAttemptButton({
  attemptId,
  assessmentTitle,
  studentName,
  redirectTo = "/owner/attempts",
}: {
  attemptId: string;
  assessmentTitle: string;
  studentName: string;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<DestructivePreview | null>(null);

  async function deleteAttempt() {
    setIsDeleting(true);
    setMessage("Deleting attempt...");
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "delete-attempt", {
        body: { attempt_id: attemptId },
        requiresAal2: true,
      });
      setMessage("Attempt deleted.");
      setIsConfirmOpen(false);
      router.refresh();
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete attempt.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <DangerMenu>
        <DangerMenuItem disabled={isDeleting} onClick={() => {
          setIsConfirmOpen(true);
          void loadPreview("attempt", attemptId).then(setPreview);
        }}>
          <Trash2 size={16} aria-hidden="true" />
          Delete attempt
        </DangerMenuItem>
      </DangerMenu>
      {message ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          {message}
        </p>
      ) : null}
      <ConfirmDialog
        open={isConfirmOpen}
        title="Delete attempt?"
        description={`Delete ${studentName}'s attempt for "${assessmentTitle}". This removes uploads, marks, annotations, reports, receipts, and recovery records. This cannot be undone.`}
        confirmLabel="Delete attempt"
        isLoading={isDeleting}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => void deleteAttempt()}
      >
        <PreviewPanel preview={preview} />
      </ConfirmDialog>
    </div>
  );
}

type DestructivePreview = {
  counts: Record<string, number>;
  warnings: string[];
};

async function loadPreview(targetKind: string, targetId: string): Promise<DestructivePreview | null> {
  const response = await fetch(`/api/owner/destructive-preview?target_kind=${encodeURIComponent(targetKind)}&target_id=${encodeURIComponent(targetId)}`);
  if (!response.ok) return null;
  return response.json() as Promise<DestructivePreview>;
}

function PreviewPanel({ preview }: { preview: DestructivePreview | null }) {
  if (!preview) return <p className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)]">Loading dependency preview...</p>;
  return (
    <div className="rounded-[4px] border border-[var(--danger)]/20 bg-[var(--danger-bg)]/20 p-3 text-xs">
      <p className="font-semibold text-[var(--danger)]">Audit preview</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(preview.counts).map(([label, count]) => (
          <span key={label} className="rounded-[2px] border border-[var(--border)] bg-white px-2 py-1 font-mono text-[var(--ink)]">{label}: {count}</span>
        ))}
      </div>
      <ul className="mt-2 list-disc pl-4 text-[var(--muted)]">
        {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
    </div>
  );
}
