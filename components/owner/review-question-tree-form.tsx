"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { QuestionNodeRow } from "@/types/database";

type EditableNode = {
  node_key: string;
  ordinal: number;
  node_type: QuestionNodeRow["node_type"];
  title: string | null;
  prompt_html: string | null;
  prompt_latex: string | null;
  marks: number | null;
  response_mode: QuestionNodeRow["response_mode"];
  interaction_json: QuestionNodeRow["interaction_json"];
};

export function ReviewQuestionTreeForm({
  versionId,
  nodes,
}: {
  versionId: string;
  nodes: QuestionNodeRow[];
}) {
  const router = useRouter();
  const initialValue = useMemo(() => {
    const editable: EditableNode[] = nodes.map((node) => ({
      node_key: node.node_key,
      ordinal: node.ordinal,
      node_type: node.node_type,
      title: node.title,
      prompt_html: node.prompt_html,
      prompt_latex: node.prompt_latex,
      marks: node.marks,
      response_mode: node.response_mode,
      interaction_json: node.interaction_json,
    }));
    return JSON.stringify(editable, null, 2);
  }, [nodes]);
  const [value, setValue] = useState(initialValue);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("Saving reviewed tree...");
    try {
      const parsed = JSON.parse(value) as EditableNode[];
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.functions.invoke("update-question-tree", {
        body: { version_id: versionId, nodes: parsed },
      });
      if (error) throw error;
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
        aria-label="Question tree JSON"
      />
      <Button className="justify-self-start" type="submit" disabled={isSubmitting}>
        Save reviewed tree
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
