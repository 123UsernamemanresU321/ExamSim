"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  async function deleteAssessment() {
    const confirmed = window.confirm(
      `Delete "${title}" and all related attempts, responses, upload slots, parse jobs, and reports? This cannot be undone.`,
    );
    if (!confirmed) return;
    setIsDeleting(true);
    setMessage("Deleting assessment...");
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "delete-assessment", {
        body: { assessment_id: assessmentId },
        requiresAal2: true,
      });
      setMessage("Assessment deleted.");
      router.refresh();
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete assessment.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="danger" disabled={isDeleting} onClick={() => void deleteAssessment()}>
        <Trash2 size={16} aria-hidden="true" />
        Delete assessment
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </div>
  );
}
