"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  async function deleteAttempt() {
    const confirmed = window.confirm(
      `Delete ${studentName}'s attempt for "${assessmentTitle}"? This removes its uploads, marks, annotations, reports, receipts, and recovery records. This cannot be undone.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setMessage("Deleting attempt...");
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "delete-attempt", {
        body: { attempt_id: attemptId },
        requiresAal2: true,
      });
      setMessage("Attempt deleted.");
      router.refresh();
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete attempt.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="danger" disabled={isDeleting} onClick={() => void deleteAttempt()}>
        <Trash2 size={16} aria-hidden="true" />
        Delete attempt
      </Button>
      {message ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
