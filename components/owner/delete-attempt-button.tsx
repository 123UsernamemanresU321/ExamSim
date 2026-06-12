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
        <DangerMenuItem disabled={isDeleting} onClick={() => setIsConfirmOpen(true)}>
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
      />
    </div>
  );
}
