"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { RefreshCw, UploadCloud, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { ParseJob, ParseJobArtifact } from "@/types/database";

export function MineruHostedPanel({
  parseJobs,
  artifacts,
  onRefresh,
}: {
  parseJobs: ParseJob[];
  artifacts: ParseJobArtifact[];
  onRefresh?: () => void | Promise<void>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const hostedJobs = useMemo(
    () => parseJobs.filter((job) => job.parser === "mineru_hosted" || job.external_provider === "mineru_hosted"),
    [parseJobs],
  );

  const invoke = useCallback(async (functionName: "mineru-submit-hosted-job" | "mineru-poll-hosted-job", parseJobId: string, options: { force?: boolean } = {}) => {
    setBusyJobId(parseJobId);
    setMessage(
      functionName === "mineru-submit-hosted-job"
        ? options.force ? "Restarting hosted MinerU with server-side PDF upload..." : "Submitting PDF to hosted MinerU..."
        : "Checking hosted MinerU result...",
    );
    const supabase = createSupabaseBrowserClient();
    try {
      const data = await invokeEdgeFunction<{ status?: string; external_state?: string; artifact_count?: number; error_message?: string; upload_mode?: string; restarted?: boolean }>(supabase, functionName, {
        body: { parse_job_id: parseJobId, force: options.force ?? false },
        requiresAal2: true,
      });
      setMessage(
        functionName === "mineru-submit-hosted-job"
          ? `Hosted MinerU job ${data?.restarted ? "restarted" : "submitted"}. Status: ${data?.status ?? "running"}. Upload mode: ${data?.upload_mode ?? "server-side"}.`
          : data?.status === "failed"
            ? `Hosted MinerU check failed: ${data.error_message ?? data.external_state ?? "provider did not complete the job"}.`
            : data?.status === "review_required"
              ? `MinerU extraction complete! ${data.artifact_count ?? 0} artifact(s) extracted. Refresh the workspace to see them.`
              : `Hosted MinerU check complete. Status: ${data?.status ?? data?.external_state ?? "running"}.`,
      );
      // Re-fetch workspace data so the UI updates immediately
      if (onRefresh) await onRefresh();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[MinerU] ${functionName} failed:`, error);
      }
      setMessage(error instanceof Error ? error.message : "Hosted MinerU request failed.");
    } finally {
      setBusyJobId(null);
    }
  }, [onRefresh]);

  // Automatic polling for running jobs
  useEffect(() => {
    const runningJobs = hostedJobs.filter(job => job.status === "running" && job.external_batch_id);
    if (runningJobs.length === 0 || busyJobId) return;

    const interval = setInterval(() => {
      // Poll the oldest running job
      const jobToPoll = runningJobs[0];
      void invoke("mineru-poll-hosted-job", jobToPoll.id);
    }, 15000);

    return () => clearInterval(interval);
  }, [hostedJobs, busyJobId, invoke]);

  if (!hostedJobs.length) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">
        No hosted MinerU PDF job is attached to this version. JSON and LaTeX parsing can still use the AI assistant.
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div>
        <h2 className="text-lg font-semibold">Hosted MinerU PDF parsing</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          Hosted MinerU receives the private PDF through a short-lived server-issued URL. Output remains draft evidence
          until you review the tree.
        </p>
      </div>
      {hostedJobs.map((job) => {
        const jobArtifacts = artifacts.filter((artifact) => artifact.parse_job_id === job.id);
        const canSubmit = job.status === "queued" || job.status === "failed";
        const canPoll = job.status === "running" && Boolean(job.external_batch_id);
        const isDone = job.status === "review_required" || job.status === "succeeded";
        const canRestart = canPoll || isDone;
        const isBusy = busyJobId === job.id;

        return (
          <div key={job.id} className="rounded-md border border-[var(--border)] bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  <span className={isDone ? "text-green-600" : canPoll ? "text-amber-600" : ""}>{job.status}</span>
                  {job.external_state ? ` · ${job.external_state}` : ""}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)]">
                  {parseJobPurpose(job) === "markscheme" ? "Markscheme OCR" : "Question paper OCR"}
                </p>
              </div>
              {isBusy && <Loader2 size={14} className="animate-spin text-[var(--muted)]" />}
              {isDone && !isBusy && <CheckCircle2 size={14} className="text-green-600" />}
            </div>
            <p className="mt-1 break-all text-xs text-[var(--muted)]">Source: {job.source_object_path}</p>
            {job.external_batch_id ? <p className="mt-1 break-all text-xs text-[var(--muted)]">Batch: {job.external_batch_id}</p> : null}
            {job.error_message ? <p className="mt-2 text-sm text-[var(--danger)]">{job.error_message}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {canSubmit ? (
                <Button type="button" variant="secondary" isLoading={isBusy} onClick={() => void invoke("mineru-submit-hosted-job", job.id)}>
                  <UploadCloud size={16} aria-hidden="true" />
                  Submit to MinerU
                </Button>
              ) : null}
              {canPoll ? (
                <Button type="button" variant="secondary" isLoading={isBusy} onClick={() => void invoke("mineru-poll-hosted-job", job.id)}>
                  {!isBusy ? <RefreshCw size={16} aria-hidden="true" /> : null}
                  Check result
                </Button>
              ) : null}
              {canRestart ? (
                <Button type="button" variant="secondary" isLoading={isBusy} onClick={() => void invoke("mineru-submit-hosted-job", job.id, { force: true })}>
                  <UploadCloud size={16} aria-hidden="true" />
                  Restart MinerU job
                </Button>
              ) : null}
            </div>
            {canPoll ? (
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                Status is automatically checked every 15s. If a job stays running for a long time, restart it. 
              </p>
            ) : null}
            {jobArtifacts.length ? (
              <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                {jobArtifacts.slice(0, 5).map((artifact) => (
                  <li key={artifact.id}>
                    {artifact.artifact_kind}: {artifact.object_path}
                  </li>
                ))}
                {jobArtifacts.length > 5 ? <li className="font-medium">…and {jobArtifacts.length - 5} more</li> : null}
              </ul>
            ) : null}
          </div>
        );
      })}
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </div>
  );
}

function parseJobPurpose(job: ParseJob) {
  const metadata = job.metadata_json;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && "parse_purpose" in metadata) {
    return metadata.parse_purpose === "markscheme" ? "markscheme" : "paper";
  }
  return "paper";
}
