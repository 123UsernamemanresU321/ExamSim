import { AlertTriangle, Clock, FileWarning, LifeBuoy, RefreshCcw, ShieldAlert } from "lucide-react";
import { runOwnerBulkOperation } from "@/app/owner/operations-actions";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { getOperationsBoard, getRecentBulkOperations } from "@/lib/owner-operations";

export default async function OwnerOperationsPage() {
  const [rows, operations] = await Promise.all([getOperationsBoard(), getRecentBulkOperations()]);
  const active = rows.filter((row) => row.state === "ACTIVE").length;
  const uploadOnly = rows.filter((row) => row.state === "UPLOAD_ONLY").length;
  const incidents = rows.reduce((count, row) => count + row.incidents, 0);
  const failedUploads = rows.reduce((count, row) => count + row.uploadSummary.failedQueueEvents, 0);

  return (
    <main className="space-y-6 pb-12">
      <SectionHeading
        title="Exam-Day Operations"
        description="Monitor active attempts, upload windows, incidents, moderation signals, and recovery work from one operational board."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active exams" value={active} tone={active ? "success" : "neutral"} />
        <StatCard label="Upload-only windows" value={uploadOnly} tone={uploadOnly ? "warning" : "neutral"} />
        <StatCard label="Student incidents" value={incidents} tone={incidents ? "danger" : "neutral"} />
        <StatCard label="Failed upload events" value={failedUploads} tone={failedUploads ? "danger" : "neutral"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bulk attempt actions</CardTitle>
          <CardDescription>Actions are validated server-side and recorded in the operations audit trail.</CardDescription>
        </CardHeader>
        <form action={runOwnerBulkOperation} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
            Operation
            <select name="operation_type" className="h-10 rounded-[2px] border border-[var(--border)] bg-white px-3">
              <option value="queue_recovery_review">Queue recovery review</option>
              <option value="grant_upload_extension">Grant upload extension</option>
              <option value="mark_incident_reviewed">Mark incidents reviewed</option>
              <option value="release_feedback">Release existing feedback packages</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
            Reason / note
            <input name="reason" className="h-10 rounded-[2px] border border-[var(--border)] bg-white px-3" placeholder="Operational reason" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
            Extra seconds
            <input name="extra_seconds" type="number" min="0" defaultValue="600" className="h-10 w-32 rounded-[2px] border border-[var(--border)] bg-white px-3" />
          </label>
          <div className="lg:col-span-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface-panel)] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--subtle)]">Select attempts</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {rows.slice(0, 18).map((row) => (
                <label key={row.attempt.id} className="flex items-center gap-2 rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)]">
                  <input name="target_ids" type="checkbox" value={row.attempt.id} />
                  <span className="min-w-0 flex-1 truncate">{row.student?.display_name ?? "Student"} · {row.assessment?.paper_code ?? row.assessment?.title ?? "Assessment"}</span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="lg:col-span-3 w-fit">
            <RefreshCcw size={16} aria-hidden="true" />
            Run selected action
          </Button>
        </form>
      </Card>

      {rows.length ? (
        <DataTable headers={["Attempt", "State", "Uploads", "Signals", "Actions"]}>
          {rows.map((row) => (
            <DataTableRow key={row.attempt.id}>
              <DataTableCell className="min-w-[260px]">
                <h2 className="font-semibold text-[var(--ink)]">{row.assessment?.title ?? "Untitled assessment"}</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {row.student?.display_name ?? "Student"} · <span className="font-mono">{row.assessment?.paper_code ?? row.attempt.id.slice(0, 8)}</span>
                </p>
              </DataTableCell>
              <DataTableCell>
                <AttemptStateBadge state={row.state} />
                <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <Clock size={13} aria-hidden="true" />
                  {new Date(row.attempt.start_at_utc).toLocaleString()}
                </p>
              </DataTableCell>
              <DataTableCell>
                <div className="grid gap-1 text-xs text-[var(--muted)]">
                  <span><strong className="text-[var(--ink)]">{row.uploadSummary.uploaded}/{row.uploadSummary.total}</strong> uploaded</span>
                  {row.uploadSummary.missing ? <Badge tone="warning">{row.uploadSummary.missing} missing</Badge> : null}
                  {row.uploadSummary.failedQueueEvents ? <Badge tone="danger">{row.uploadSummary.failedQueueEvents} failed queue events</Badge> : null}
                </div>
              </DataTableCell>
              <DataTableCell>
                <div className="flex flex-wrap gap-2">
                  {row.incidents ? <Badge tone="danger"><AlertTriangle size={12} aria-hidden="true" /> {row.incidents} incident(s)</Badge> : null}
                  {row.moderationEvents ? <Badge tone="warning"><ShieldAlert size={12} aria-hidden="true" /> {row.moderationEvents} signal(s)</Badge> : null}
                  {!row.incidents && !row.moderationEvents ? <Badge tone="neutral">No open signals</Badge> : null}
                </div>
              </DataTableCell>
              <DataTableCell className="text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <ButtonLink href={`/owner/attempts/${row.attempt.id}/mark`}><FileWarning size={16} aria-hidden="true" /> Mark</ButtonLink>
                  <ButtonLink href={`/owner/attempts/${row.attempt.id}/recovery`} variant="secondary"><LifeBuoy size={16} aria-hidden="true" /> Recovery</ButtonLink>
                </div>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      ) : (
        <EmptyState title="No attempts to monitor" description="Published attempts will appear here as they approach writing, upload-only, or review states." />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent bulk operations</CardTitle>
          <CardDescription>Immutable operation records for actions run from this board.</CardDescription>
        </CardHeader>
        {operations.length ? (
          <div className="grid gap-2">
            {operations.map((operation) => (
              <div key={operation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[var(--border)] p-3 text-sm">
                <div>
                  <p className="font-semibold text-[var(--ink)]">{operation.operation_type.replaceAll("_", " ")}</p>
                  <p className="text-xs text-[var(--muted)]">{operation.target_ids.length} target(s) · {new Date(operation.created_at).toLocaleString()}</p>
                </div>
                <Badge tone={operation.status === "completed" ? "success" : operation.status === "failed" ? "danger" : operation.status === "partial" ? "warning" : "neutral"}>
                  {operation.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No bulk operations recorded" description="Run a selected action above to create an auditable operation record." />
        )}
      </Card>
    </main>
  );
}
