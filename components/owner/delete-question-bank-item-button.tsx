"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DangerMenu, DangerMenuItem } from "@/components/ui/danger-menu";
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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  async function deleteQuestionBankItem() {
    setIsDeleting(true);
    setMessage("Deleting question bank item...");
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "delete-question-bank-item", {
        body: { question_bank_item_id: questionBankItemId },
        requiresAal2: true,
      });
      setMessage("Question bank item deleted.");
      setIsConfirmOpen(false);
      router.refresh();
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete question bank item.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <DangerMenu>
        <DangerMenuItem disabled={isDeleting} onClick={() => setIsConfirmOpen(true)}>
          <Trash2 size={16} aria-hidden="true" />
          Delete question
        </DangerMenuItem>
      </DangerMenu>
      {message ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          {message}
        </p>
      ) : null}
      <ConfirmDialog
        open={isConfirmOpen}
        title="Delete question-bank item?"
        description={`Delete "${label}" from the question bank. This removes reusable question-bank metadata and generated-paper references, but not the original assessment source files. This cannot be undone.`}
        confirmLabel="Delete question"
        isLoading={isDeleting}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => void deleteQuestionBankItem()}
      />
    </div>
  );
}
