import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import {
  getExamsimProductionReadiness,
  summarizeExamsimProductionReadiness,
  type ExamsimProductionReadinessItem,
  type ExamsimProductionStatus,
} from "@/lib/examsim-production-readiness";

const statusLabels: Record<ExamsimProductionStatus, string> = {
  ready: "Ready",
  provider_ready_needs_staging: "Provider ready",
  provider_required: "Provider required",
  manual_fallback: "Manual fallback",
  blocked: "Blocked",
  staging_required: "Staging required",
};

const statusTones: Record<ExamsimProductionStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  ready: "success",
  provider_ready_needs_staging: "warning",
  provider_required: "warning",
  manual_fallback: "info",
  blocked: "danger",
  staging_required: "warning",
};

function ReadinessStatusBadge({ status }: { status: ExamsimProductionStatus }) {
  return <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>;
}

function ReadinessDetail({ item }: { item: ExamsimProductionReadinessItem }) {
  const fallbackOrBlocker = item.blocker ?? item.fallback;

  return (
    <div className="grid gap-2 text-[12px] leading-5 text-[var(--muted)]">
      {fallbackOrBlocker ? <p>{fallbackOrBlocker}</p> : null}
      {item.requiredEnvVars.length ? (
        <p>
          <span className="font-semibold text-[var(--ink)]">Env:</span> {item.requiredEnvVars.join(", ")}
        </p>
      ) : null}
      <p>
        <span className="font-semibold text-[var(--ink)]">QA:</span> {item.qaChecklist.slice(0, 3).join("; ")}
      </p>
    </div>
  );
}

export function ExamsimProductionReadinessPanel() {
  const readiness = getExamsimProductionReadiness();
  const summary = summarizeExamsimProductionReadiness(readiness);

  return (
    <Card className="content-start" aria-label="Production readiness matrix for Smart Import / Exam Compiler and Guest SEB / Lockdown">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Production readiness matrix</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Tracks every Examsim product-spec capability as ready, provider-gated, blocked, or requiring staging. The app
            should not overclaim OCR, SEB, offline, or automation features that are not fully verified.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">{summary.ready} ready</Badge>
          <Badge tone="warning">{summary.providerRequired + summary.providerReadyNeedsStaging} provider-gated</Badge>
          <Badge tone="info">{summary.manualFallback} fallback</Badge>
          <Badge tone="danger">{summary.blocked} blocked</Badge>
        </div>
      </div>

      <div className="mt-5">
        <DataTable headers={["Feature", "Status", "Production path", "Fallback / QA"]} className="shadow-none">
          {readiness.map((item) => (
            <DataTableRow key={item.key}>
              <DataTableCell className="min-w-[220px]">
                <p className="font-semibold text-[var(--ink)]">{item.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{item.ownerMessage}</p>
              </DataTableCell>
              <DataTableCell className="whitespace-nowrap">
                <ReadinessStatusBadge status={item.status} />
              </DataTableCell>
              <DataTableCell className="min-w-[260px] text-[var(--muted)]">{item.productionPath}</DataTableCell>
              <DataTableCell className="min-w-[260px]">
                <ReadinessDetail item={item} />
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      </div>
    </Card>
  );
}
