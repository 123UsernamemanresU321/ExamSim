import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import {
  buildImportGovernanceSummary,
  getImportJobState,
  getProviderReadiness,
  importJobStateTone,
  providerStatusTone,
  summarizeImportJobs,
  V3_IMPORT_JOB_LABELS,
  V3_IMPORT_JOB_STATES,
  type ImportAuditLike,
  type ImportJobLike,
} from "@/lib/examsim/provider-readiness";

export function ProviderReadinessDashboard({
  importJobs = [],
  importAuditLogs = [],
}: {
  importJobs?: ImportJobLike[];
  importAuditLogs?: ImportAuditLike[];
}) {
  const providers = getProviderReadiness();
  const jobSummary = summarizeImportJobs(importJobs);
  const governance = buildImportGovernanceSummary({ jobs: importJobs, auditLogs: importAuditLogs });

  return (
    <Card aria-label="V3 provider and import readiness dashboard">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Provider and import readiness</CardTitle>
            <CardDescription>
              Configuration-only checks for OCR, AI grouping, LaTeX, private storage, Edge Functions, notifications,
              and exports. This dashboard does not send prompts, PDFs, or student data to external providers.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={jobSummary.actionRequired ? "warning" : "success"}>{jobSummary.actionRequired} action required</Badge>
            <Badge tone="info">{jobSummary.active} active</Badge>
            <Badge tone="success">{jobSummary.completed} completed</Badge>
            <Badge tone={governance.jobsRequiringConfirmation ? "warning" : "neutral"}>
              {governance.jobsRequiringConfirmation} cost check
            </Badge>
          </div>
        </div>
      </CardHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <DataTable headers={["Capability", "Status", "Safe probe", "Setup / fallback"]} className="shadow-none">
          {providers.map((item) => (
            <DataTableRow key={item.key}>
              <DataTableCell className="min-w-[210px]">
                <p className="font-semibold text-[var(--ink)]">{item.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{item.ownerMessage}</p>
              </DataTableCell>
              <DataTableCell className="whitespace-nowrap">
                <Badge tone={providerStatusTone(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
                {item.requiredEnvVars.length ? (
                  <p className="mt-2 max-w-[220px] text-[11px] leading-5 text-[var(--muted)]">
                    {item.requiredEnvVars.join(", ")}
                  </p>
                ) : null}
              </DataTableCell>
              <DataTableCell className="min-w-[220px] text-[var(--muted)]">{item.safeProbe}</DataTableCell>
              <DataTableCell className="min-w-[240px]">
                <p className="text-[13px] leading-5 text-[var(--muted)]">{item.setupReference}</p>
                <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
                  <span className="font-semibold text-[var(--ink)]">Fallback:</span> {item.fallback}
                </p>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>

        <div className="grid content-start gap-4">
          <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Import job states</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {V3_IMPORT_JOB_STATES.map((state) => (
                <Badge key={state} tone={importJobStateTone(state)}>
                  {V3_IMPORT_JOB_LABELS[state]} {jobSummary.byState[state] ? `(${jobSummary.byState[state]})` : ""}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Existing parser rows are normalized into V3 workflow states so queued, retried, failed, low-confidence,
              and review-required imports are visible before publish.
            </p>
          </div>

          <div className="rounded-[4px] border border-[var(--border)] bg-white p-4">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Cost, quota, and audit guardrails</h3>
            <div className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
              <p>
                <span className="font-semibold text-[var(--ink)]">{governance.totalPages}</span> pages tracked across recent
                imports.
              </p>
              <p>
                <span className="font-semibold text-[var(--ink)]">
                  ${governance.totalEstimatedCostUsd.toFixed(2)}
                </span>{" "}
                estimated provider spend from metadata.
              </p>
              <p>
                <span className="font-semibold text-[var(--ink)]">{governance.audit.importAuditCount}</span> import audit event(s)
                visible to this owner.
              </p>
            </div>
            {governance.jobsRequiringConfirmation ? (
              <p className="mt-3 rounded-[4px] border border-[rgba(146,64,14,0.2)] bg-[var(--warning-bg)] p-3 text-sm leading-6 text-[var(--warning)]">
                Large or costly import jobs should require explicit owner confirmation before provider submission.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                No recent import job exceeds the default page or cost confirmation thresholds.
              </p>
            )}
          </div>

          <DataTable headers={["Recent import", "State"]} className="shadow-none">
            {importJobs.length ? importJobs.slice(0, 8).map((job) => {
              const state = getImportJobState(job);
              const guard = governance.costGuards.find((candidate, index) => importJobs[index] === job);
              return (
                <DataTableRow key={job.id ?? `${job.parser}-${job.created_at}`}>
                  <DataTableCell>
                    <p className="font-mono text-[12px] text-[var(--ink)]">{job.parser ?? "unknown"}</p>
                    <p className="mt-1 text-[12px] text-[var(--muted)]">{formatDate(job.updated_at ?? job.created_at)}</p>
                    {guard ? (
                      <p className="mt-1 text-[12px] text-[var(--muted)]">
                        {guard.sourceLabel} · {guard.pageCount ?? 0} pages · retry {guard.retryCount}
                      </p>
                    ) : null}
                    {job.error_message ? <p className="mt-1 text-[12px] text-[var(--danger)]">{job.error_message}</p> : null}
                  </DataTableCell>
                  <DataTableCell className="whitespace-nowrap">
                    <Badge tone={importJobStateTone(state)}>{V3_IMPORT_JOB_LABELS[state]}</Badge>
                    {guard?.requiresConfirmation ? <Badge tone="warning" className="mt-2">Review cost</Badge> : null}
                  </DataTableCell>
                </DataTableRow>
              );
            }) : (
              <DataTableRow>
                <DataTableCell className="text-[var(--muted)]">
                  No import jobs are visible for this owner yet. Start from an assessment compiler page to create a PDF,
                  LaTeX, JSON, or markscheme import job.
                </DataTableCell>
                <DataTableCell className="text-[var(--muted)]">Waiting</DataTableCell>
              </DataTableRow>
            )}
          </DataTable>
        </div>
      </div>
    </Card>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
