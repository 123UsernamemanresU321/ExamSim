"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function DeleteQuestionBankItemButton({
  questionBankItemId,
  label,
  redirectTo = "/owner/question-bank",
}: {
  questionBankItemId: string;
  label: string;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteQuestionBankItem() {
    const confirmed = window.confirm(
      `Delete "${label}" from the question bank? This removes reusable question-bank metadata and generated-paper references, but not the original assessment source files. This cannot be undone.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setMessage("Deleting question bank item...");
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "delete-question-bank-item", {
        body: { question_bank_item_id: questionBankItemId },
        requiresAal2: true,
      });
      setMessage("Question bank item deleted.");
      router.refresh();
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete question bank item.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="danger" disabled={isDeleting} onClick={() => void deleteQuestionBankItem()}>
        <Trash2 size={16} aria-hidden="true" />
        Delete question
      </Button>
      {message ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
