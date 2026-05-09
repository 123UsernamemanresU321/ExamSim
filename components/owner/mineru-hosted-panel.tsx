"use client";

import { useMemo, useState } from "react";
import { RefreshCw, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { ParseJob, ParseJobArtifact } from "@/types/database";

export function MineruHostedPanel({
  parseJobs,
  artifacts,
}: {
  parseJobs: ParseJob[];
  artifacts: ParseJobArtifact[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const hostedJobs = useMemo(
    () => parseJobs.filter((job) => job.parser === "mineru_hosted" || job.external_provider === "mineru_hosted"),
    [parseJobs],
  );

  async function invoke(functionName: "mineru-submit-hosted-job" | "mineru-poll-hosted-job", parseJobId: string, options: { force?: boolean } = {}) {
    console.log(`[MinerU] Calling ${functionName} for job ${parseJobId}...`);
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
      console.log(`[MinerU] ${functionName} response received:`, data);
      setMessage(
        functionName === "mineru-submit-hosted-job"
          ? `Hosted MinerU job ${data?.restarted ? "restarted" : "submitted"}. Status: ${data?.status ?? "running"}. Upload mode: ${data?.upload_mode ?? "server-side"}.`
          : data?.status === "failed"
            ? `Hosted MinerU check failed: ${data.error_message ?? data.external_state ?? "provider did not complete the job"}.`
            : `Hosted MinerU check complete. Status: ${data?.status ?? data?.external_state ?? "running"}.`,
      );
      router.refresh();
    } catch (error) {
      console.error(`[MinerU] ${functionName} failed:`, error);
      setMessage(error instanceof Error ? error.message : "Hosted MinerU request failed.");
    } finally {
      setBusyJobId(null);
    }
  }

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
        const canRestart = canPoll;
        return (
          <div key={job.id} className="rounded-md border border-[var(--border)] bg-white p-4">
            <p className="text-sm font-semibold">
              {job.status} {job.external_state ? `· ${job.external_state}` : ""}
            </p>
            <p className="mt-1 break-all text-xs text-[var(--muted)]">Source: {job.source_object_path}</p>
            {job.external_batch_id ? <p className="mt-1 break-all text-xs text-[var(--muted)]">Batch: {job.external_batch_id}</p> : null}
            {job.error_message ? <p className="mt-2 text-sm text-[var(--danger)]">{job.error_message}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {canSubmit ? (
                <Button type="button" variant="secondary" disabled={busyJobId === job.id} onClick={() => void invoke("mineru-submit-hosted-job", job.id)}>
                  <UploadCloud size={16} aria-hidden="true" />
                  Submit to MinerU
                </Button>
              ) : null}
              {canPoll ? (
                <Button type="button" variant="secondary" disabled={busyJobId === job.id} onClick={() => void invoke("mineru-poll-hosted-job", job.id)}>
                  <RefreshCw size={16} aria-hidden="true" />
                  Check result
                </Button>
              ) : null}
              {canRestart ? (
                <Button type="button" variant="secondary" disabled={busyJobId === job.id} onClick={() => void invoke("mineru-submit-hosted-job", job.id, { force: true })}>
                  <UploadCloud size={16} aria-hidden="true" />
                  Restart MinerU job
                </Button>
              ) : null}
            </div>
            {canPoll ? (
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                If a job stays pending/running for a long time, restart it. Exam Vault will use server-side file upload
                to avoid signed URL fetch timeouts.
              </p>
            ) : null}
            {jobArtifacts.length ? (
              <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                {jobArtifacts.slice(0, 5).map((artifact) => (
                  <li key={artifact.id}>
                    {artifact.artifact_kind}: {artifact.object_path}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </div>
  );
}
