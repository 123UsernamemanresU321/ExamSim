import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import {
  buildDeploymentReadinessChecklist,
  deploymentReadinessTone,
  summarizeDeploymentReadiness,
} from "@/lib/examsim/deployment-readiness";

export function DeploymentReadinessConsole() {
  const checklist = buildDeploymentReadinessChecklist();
  const summary = summarizeDeploymentReadiness(checklist);

  return (
    <Card aria-label="V3 deployment readiness console">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Deployment readiness console</CardTitle>
            <CardDescription>
              Launch checklist for migrations, RLS, private storage, Edge Functions, provider setup, seed accounts, and
              security claims. Items marked manual validation should be checked on the actual website with synthetic
              owner, student, and guest records before high-stakes use.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{summary.ready} ready</Badge>
            <Badge tone="danger">{summary.blocked} blocked</Badge>
            <Badge tone="warning">{summary.manualValidation} manual validation</Badge>
            <Badge tone="warning">{summary.providerGated} provider gated</Badge>
          </div>
        </div>
      </CardHeader>

      <DataTable headers={["Gate", "Status", "Evidence", "Next action"]} className="shadow-none">
        {checklist.map((item) => (
          <DataTableRow key={item.key}>
            <DataTableCell className="min-w-[220px]">
              <p className="font-semibold text-[var(--ink)]">{item.title}</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{item.ownerMessage}</p>
              {item.requiredEnvVars.length ? (
                <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                  {item.requiredEnvVars.join(", ")}
                </p>
              ) : null}
            </DataTableCell>
            <DataTableCell className="whitespace-nowrap">
              <Badge tone={deploymentReadinessTone(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
            </DataTableCell>
            <DataTableCell className="min-w-[260px] text-[var(--muted)]">{item.evidence}</DataTableCell>
            <DataTableCell className="min-w-[260px] text-[var(--muted)]">{item.nextAction}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>
    </Card>
  );
}
