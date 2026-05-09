"use client";

import { useEffect, useState, use } from "react";
import { AiParseReviewPanel } from "@/components/owner/ai-parse-review-panel";
import { MineruHostedPanel } from "@/components/owner/mineru-hosted-panel";
import { ReviewQuestionTreeForm } from "@/components/owner/review-question-tree-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { getAssessmentWorkspaceClient, type AssessmentWorkspace } from "@/lib/live-data-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ParseReviewClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [workspace, setWorkspace] = useState<AssessmentWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const data = await getAssessmentWorkspaceClient(id, supabase);
        setWorkspace(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load workspace");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id]);

  if (isLoading) {
    return (
      <SectionHeading
        title="Parse review"
        description="Loading assessment workspace..."
      />
    );
  }

  if (error || !workspace?.latestVersion) {
    return (
      <SectionHeading
        title="Parse review"
        description={error || "Assessment or draft version was not found."}
      />
    );
  }

  return (
    <>
      <SectionHeading
        title="Parse review"
        description={`${workspace.assessment.title}. Owner confirms the question/subquestion tree before publish.`}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(520px,1fr)_460px]">
        <Card className="paper-sheet min-h-[680px]">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--subtle)]">Source preview</p>
          <div className="paper-body space-y-4 text-base leading-7 text-[var(--muted)]">
            <p>Original PDF/LaTeX preview is private and rendered here for owner review.</p>
            <p>PDF parsing uses hosted MinerU when configured. JSON and LaTeX receive deterministic package extraction.</p>
          </div>
        </Card>
        <Card className="grid content-start gap-4 shadow-none">
          <h2 className="text-lg font-semibold">Detected tree</h2>
          {workspace.questionNodes.map((node) => (
            <div key={node.id} className="rounded-md border border-[var(--border)] bg-white p-4">
              <p className="text-sm font-semibold">
                {node.node_key} · {node.node_type} · {node.response_mode}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">{node.title}</p>
            </div>
          ))}
          <MineruHostedPanel parseJobs={workspace.parseJobs} artifacts={workspace.parseArtifacts} />
          <AiParseReviewPanel version={workspace.latestVersion} nodes={workspace.questionNodes} artifacts={workspace.parseArtifacts} />
          <ReviewQuestionTreeForm versionId={workspace.latestVersion.id} nodes={workspace.questionNodes} />
        </Card>
      </div>
    </>
  );
}
