"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { parseQuestionTreeInput, serializeEditableQuestionNodes } from "@/lib/question-tree-editor";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { QuestionNodeRow } from "@/types/database";

export function ReviewQuestionTreeForm({
  versionId,
  nodes,
}: {
  versionId: string;
  nodes: QuestionNodeRow[];
}) {
  const router = useRouter();
  const initialValue = useMemo(() => serializeEditableQuestionNodes(nodes), [nodes]);
  const [value, setValue] = useState(initialValue);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("Saving reviewed tree...");
    try {
      const parsed = parseQuestionTreeInput(value);
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "update-question-tree", {
        body: { version_id: versionId, nodes: parsed.nodes, normalized_package: parsed.normalizedPackage },
      });
      setMessage("Reviewed tree saved. This version can now be published.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save reviewed tree.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Textarea
        className="min-h-[420px] font-mono text-xs"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Question tree JSON. Accepts a node array or a full normalized package from the AI assistant."
      />
      <p className="text-sm leading-6 text-[var(--muted)]">
        You may paste either the editable node array or the full normalized package proposal from the AI assistant.
      </p>
      <Button className="justify-self-start" type="submit" disabled={isSubmitting}>
        Save reviewed tree
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
