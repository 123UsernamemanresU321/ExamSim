"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DangerMenu, DangerMenuItem } from "@/components/ui/danger-menu";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function DeleteAssessmentButton({
  assessmentId,
  title,
  redirectTo = "/owner/assessments",
}: {
  assessmentId: string;
  title: string;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  async function deleteAssessment() {
    setIsDeleting(true);
    setMessage("Deleting assessment...");
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "delete-assessment", {
        body: { assessment_id: assessmentId },
        requiresAal2: true,
      });
      setMessage("Assessment deleted.");
      setIsConfirmOpen(false);
      router.refresh();
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete assessment.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <DangerMenu>
        <DangerMenuItem disabled={isDeleting} onClick={() => setIsConfirmOpen(true)}>
          <Trash2 size={16} aria-hidden="true" />
          Delete assessment
        </DangerMenuItem>
      </DangerMenu>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
      <ConfirmDialog
        open={isConfirmOpen}
        title="Delete assessment?"
        description={`Delete "${title}" and all related attempts, responses, upload slots, parse jobs, and reports. This cannot be undone.`}
        confirmLabel="Delete assessment"
        isLoading={isDeleting}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => void deleteAssessment()}
      />
    </div>
  );
}
