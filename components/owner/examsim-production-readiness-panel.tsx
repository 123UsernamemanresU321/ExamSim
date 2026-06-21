import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ReadinessList,
  ReadinessListDetail,
  ReadinessListDetails,
  ReadinessListRow,
} from "@/components/ui/readiness-list";
import {
  buildReleaseCandidateReadiness,
  getExamsimProductionReadiness,
  summarizeExamsimProductionReadiness,
  type ExamsimProductionReadinessItem,
  type ExamsimProductionStatus,
} from "@/lib/examsim-production-readiness";

const statusLabels: Record<ExamsimProductionStatus, string> = {
  ready: "Ready",
  provider_required: "Provider required",
  manual_fallback: "Manual fallback",
  blocked: "Blocked",
  live_validation_required: "Live validation required",
  staging_required: "Live sample required",
  v4_future: "V4 / future",
};

const statusTones: Record<ExamsimProductionStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  ready: "success",
  provider_required: "warning",
  manual_fallback: "info",
  blocked: "danger",
  live_validation_required: "warning",
  staging_required: "warning",
  v4_future: "neutral",
};

const evidenceLabels = {
  routes: "Routes",
  tests: "Tests",
  migrations: "Migrations",
  components: "Components",
  serverActions: "Server actions",
  edgeFunctions: "Edge functions",
  browserVerification: "Browser verification",
  seededQa: "Seeded QA",
  providerValidation: "Provider validation",
} as const;

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

function ReadinessEvidence({ item }: { item: ExamsimProductionReadinessItem }) {
  const groups = Object.entries(item.evidence).filter((entry): entry is [keyof typeof evidenceLabels, string[]] => Boolean(entry[1]?.length));

  return (
    <div className="grid gap-2 text-[12px] leading-5 text-[var(--muted)]">
      {groups.map(([kind, entries]) => (
        <p key={kind} className="min-w-0 break-words">
          <span className="font-semibold text-[var(--ink)]">{evidenceLabels[kind]}:</span> {entries.join("; ")}
        </p>
      ))}
    </div>
  );
}

export function ExamsimProductionReadinessPanel() {
  const readiness = getExamsimProductionReadiness();
  const summary = summarizeExamsimProductionReadiness(readiness);
  const releaseCandidate = buildReleaseCandidateReadiness(readiness);

  return (
    <Card className="content-start" aria-label="Production readiness matrix for Smart Import / Exam Compiler and Guest SEB / Lockdown">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Production readiness matrix</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Tracks every Examsim product-spec capability as ready, provider-gated, blocked, or requiring live validation
            on the actual website. The app should not overclaim OCR, SEB, offline, or automation features that are not
            fully verified.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge tone="success">{summary.ready} ready</Badge>
          <Badge tone="warning">{summary.providerRequired} provider-gated</Badge>
          <Badge tone="warning">{summary.stagingRequired} live sample</Badge>
          <Badge tone="info">{summary.manualFallback} fallback</Badge>
          <Badge tone="danger">{summary.blocked} blocked</Badge>
        </div>
      </div>

      <div className="mt-5 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Release candidate readiness</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{releaseCandidate.ownerMessage}</p>
          </div>
          <Badge className="shrink-0 self-start" tone={releaseCandidate.readyForFullV3 ? "success" : "warning"}>
            {releaseCandidate.readyForFullV3 ? "Full V3 ready" : `${releaseCandidate.remainingItems.length} remaining`}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={releaseCandidate.blockingCount ? "danger" : "success"}>{releaseCandidate.blockingCount} blocked</Badge>
          <Badge tone={releaseCandidate.providerGatedCount ? "warning" : "success"}>{releaseCandidate.providerGatedCount} provider-gated</Badge>
          <Badge tone={releaseCandidate.liveValidationRequiredCount ? "warning" : "success"}>
            {releaseCandidate.liveValidationRequiredCount} live validation
          </Badge>
          <Badge tone={releaseCandidate.stagingRequiredCount ? "warning" : "success"}>
            {releaseCandidate.stagingRequiredCount} live sample
          </Badge>
          <Badge tone={releaseCandidate.manualFallbackCount ? "info" : "success"}>{releaseCandidate.manualFallbackCount} fallback</Badge>
        </div>
        {releaseCandidate.remainingItems.length ? (
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Next unresolved areas: {releaseCandidate.remainingItems.slice(0, 5).map((item) => item.title).join(", ")}
            {releaseCandidate.remainingItems.length > 5 ? ", ..." : ""}
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        <ReadinessList aria-label="Product capability readiness">
          {readiness.map((item) => (
            <ReadinessListRow key={item.key}>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--ink)]">{item.title}</p>
                  <p className="mt-1 max-w-4xl break-words text-[13px] leading-5 text-[var(--muted)]">{item.ownerMessage}</p>
                </div>
                <ReadinessStatusBadge status={item.status} />
              </div>
              <ReadinessListDetails className="xl:grid-cols-3">
                <ReadinessListDetail label="Production path">{item.productionPath}</ReadinessListDetail>
                <ReadinessListDetail label="Fallback and QA">
                  <ReadinessDetail item={item} />
                </ReadinessListDetail>
                <ReadinessListDetail label="Evidence">
                  <ReadinessEvidence item={item} />
                </ReadinessListDetail>
              </ReadinessListDetails>
            </ReadinessListRow>
          ))}
        </ReadinessList>
      </div>
    </Card>
  );
}
