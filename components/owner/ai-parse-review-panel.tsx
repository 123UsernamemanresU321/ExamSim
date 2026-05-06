"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AssessmentVersion, QuestionNodeRow } from "@/types/database";

export function AiParseReviewPanel({
  version,
  nodes,
}: {
  version: AssessmentVersion;
  nodes: QuestionNodeRow[];
}) {
  const [ownerNotes, setOwnerNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [suggestionJson, setSuggestionJson] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sourceText = useMemo(() => JSON.stringify({ existing_nodes: nodes, package: version.normalized_package_json }, null, 2), [nodes, version.normalized_package_json]);

  async function requestSuggestion() {
    setIsSubmitting(true);
    setMessage("Requesting DeepSeek review suggestion...");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke<{
      suggestion?: { normalized_package_json: unknown; confidence: number; warnings_json: unknown };
    }>("ai-parse-assessment", {
      body: {
        assessment_version_id: version.id,
        source_kind: version.source_kind,
        source_text: sourceText,
        owner_notes: ownerNotes,
      },
    });
    setIsSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSuggestionJson(JSON.stringify(data?.suggestion?.normalized_package_json ?? {}, null, 2));
    setMessage(`AI suggestion created. Confidence ${Math.round(Number(data?.suggestion?.confidence ?? 0) * 100)}%. Owner review is still mandatory.`);
  }

  return (
    <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div>
        <h2 className="text-lg font-semibold">AI parse assistant</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          DeepSeek can propose a normalized tree from the current draft or MinerU artifacts. It never publishes directly.
        </p>
      </div>
      <Field label="Owner notes for AI">
        <Textarea value={ownerNotes} onChange={(event) => setOwnerNotes(event.target.value)} placeholder="Example: IB sections should be grouped by Section A/B; preserve subquestion labels." />
      </Field>
      <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => void requestSuggestion()}>
        <Sparkles size={16} aria-hidden="true" />
        Request DeepSeek suggestion
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
      {suggestionJson ? (
        <Field label="AI normalized package proposal">
          <Textarea className="min-h-64 font-mono text-xs" value={suggestionJson} readOnly />
        </Field>
      ) : null}
    </div>
  );
}
