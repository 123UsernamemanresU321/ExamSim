"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, use, useMemo, useCallback } from "react";
import { AiParseReviewPanel } from "@/components/owner/ai-parse-review-panel";
import { MineruHostedPanel } from "@/components/owner/mineru-hosted-panel";
import { ReviewQuestionTreeForm } from "@/components/owner/review-question-tree-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { getAssessmentWorkspaceClient, type AssessmentWorkspace } from "@/lib/live-data-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

const IMAGE_EXTS = /\.(png|jpe?g|svg)$/i;

function ExtractedDiagrams({ artifacts }: { artifacts: { artifact_kind: string; object_path: string }[] }) {
  const imageArtifacts = useMemo(
    () => artifacts.filter((a) => a.artifact_kind === "layout" && IMAGE_EXTS.test(a.object_path)),
    [artifacts],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!imageArtifacts.length) return;
    let cancelled = false;
    async function resolve() {
      const supabase = createSupabaseBrowserClient();
      const resolved: Record<string, string> = {};
      for (const a of imageArtifacts) {
        try {
          const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
            body: {
              bucket: "assessment-packages",
              object_path: a.object_path,
              purpose: "parse_artifact",
              expires_in_seconds: 300,
            },
            requiresAal2: true,
          });
          if (data?.signed_url) resolved[a.object_path] = data.signed_url;
        } catch { /* skip */ }
      }
      if (!cancelled) setUrls(resolved);
    }
    resolve();
    return () => { cancelled = true; };
  }, [imageArtifacts]);

  if (!imageArtifacts.length) return null;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">
        Extracted diagrams ({imageArtifacts.length})
      </p>
      <div className="flex flex-wrap gap-3">
        {imageArtifacts.map((a) => (
          <div key={a.object_path} className="overflow-hidden rounded-md border border-[var(--border)] bg-white">
            {urls[a.object_path] ? (
              <img
                src={urls[a.object_path]}
                alt={a.object_path.split("/").pop() ?? "diagram"}
                className="max-h-48 max-w-[200px] object-contain p-1"
                loading="lazy"
              />
            ) : (
              <div className="grid h-20 w-32 place-items-center text-xs text-[var(--muted)]">Loading…</div>
            )}
            <p className="truncate border-t border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-[var(--muted)]">
              {a.object_path.split("/").pop()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ParseReviewClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [workspace, setWorkspace] = useState<AssessmentWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const data = await getAssessmentWorkspaceClient(id, supabase);
      setWorkspace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const refreshWorkspace = useCallback(async () => {
    await loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);


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
            <div
              key={node.id}
              className={`relative rounded-md border border-[var(--border)] bg-white p-4 ${
                node.node_type === "subquestion" ? "ml-8" : node.node_type === "part" ? "ml-16" : ""
              }`}
            >
              {(node.node_type === "subquestion" || node.node_type === "part") && (
                <div
                  className="absolute bottom-1/2 left-[-1.5rem] top-[-2rem] w-4 rounded-bl-lg border-b-2 border-l-2 border-[var(--border)] opacity-60"
                  aria-hidden="true"
                />
              )}
              <p className="text-sm font-semibold">
                {node.node_key} · {node.node_type} · {node.response_mode}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">{node.title}</p>
            </div>
          ))}
          <ExtractedDiagrams artifacts={workspace.parseArtifacts} />
          <MineruHostedPanel parseJobs={workspace.parseJobs} artifacts={workspace.parseArtifacts} onRefresh={refreshWorkspace} />
          <AiParseReviewPanel version={workspace.latestVersion} nodes={workspace.questionNodes} artifacts={workspace.parseArtifacts} />
          <ReviewQuestionTreeForm versionId={workspace.latestVersion.id} nodes={workspace.questionNodes} />
        </Card>
      </div>
    </>
  );
}
