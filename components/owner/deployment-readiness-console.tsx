import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ReadinessList,
  ReadinessListDetail,
  ReadinessListDetails,
  ReadinessListRow,
} from "@/components/ui/readiness-list";
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
          <div className="min-w-0">
            <CardTitle>Deployment readiness console</CardTitle>
            <CardDescription>
              Launch checklist for migrations, RLS, private storage, Edge Functions, provider setup, seed accounts, and
              security claims. Items marked manual validation should be checked on the actual website with synthetic
              owner, student, and guest records before high-stakes use.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Badge tone="success">{summary.ready} ready</Badge>
            <Badge tone="danger">{summary.blocked} blocked</Badge>
            <Badge tone="warning">{summary.manualValidation} manual validation</Badge>
            <Badge tone="warning">{summary.providerGated} provider gated</Badge>
          </div>
        </div>
      </CardHeader>

      <ReadinessList aria-label="Deployment readiness gates">
        {checklist.map((item) => (
          <ReadinessListRow key={item.key}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--ink)]">{item.title}</p>
                <p className="mt-1 max-w-4xl break-words text-[13px] leading-5 text-[var(--muted)]">{item.ownerMessage}</p>
              </div>
              <Badge className="shrink-0 self-start" tone={deploymentReadinessTone(item.status)}>
                {item.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <ReadinessListDetails>
              <ReadinessListDetail label="Required configuration">
                {item.requiredEnvVars.length ? item.requiredEnvVars.join(", ") : "No external configuration required."}
              </ReadinessListDetail>
              <ReadinessListDetail label="Evidence">{item.evidence}</ReadinessListDetail>
              <ReadinessListDetail label="Next action">{item.nextAction}</ReadinessListDetail>
            </ReadinessListDetails>
          </ReadinessListRow>
        ))}
      </ReadinessList>
    </Card>
  );
}
