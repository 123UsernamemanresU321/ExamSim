import { AlertTriangle, CheckCircle2, FileLock2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PackageIntegrityReport, PublishDiffSummary } from "@/lib/owner-operations";

export function PublishDiffPanel({ diff, integrity }: { diff: PublishDiffSummary; integrity: PackageIntegrityReport }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Publish diff review</CardTitle>
          <CardDescription>Review structural and delivery changes before creating immutable attempts.</CardDescription>
        </CardHeader>
        <div className="grid gap-3 text-sm">
          <DiffRow label="Latest version" value={diff.latestVersion ? `v${diff.latestVersion.version_no} · ${diff.latestVersion.status}` : "No version"} />
          <DiffRow label="Question nodes" value={`${diff.questionCount} total · ${diff.rootQuestionCount} root question(s)`} />
          <DiffRow label="Upload ownership" value={diff.uploadRootOnly ? "Root-question only" : "Child upload mode detected"} tone={diff.uploadRootOnly ? "success" : "danger"} />
          <DiffRow label="Markscheme mapping" value={`${diff.markschemeMappedCount} mapped section(s)`} tone={diff.markschemeMappedCount ? "success" : "warning"} />
          {diff.deliveryWarnings.length ? (
            <div className="rounded-[4px] border border-[var(--warning)]/25 bg-[var(--warning-bg)] p-3 text-[var(--warning)]">
              <p className="mb-1 font-semibold">Warnings</p>
              <ul className="list-disc pl-4 text-xs leading-5">
                {diff.deliveryWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileLock2 size={18} aria-hidden="true" />
            Package integrity
          </CardTitle>
          <CardDescription>No exam content is loaded before server-computed ACTIVE; this verifies publish readiness only.</CardDescription>
        </CardHeader>
        <div className="grid gap-2">
          <Badge tone={integrity.status === "ready" ? "success" : integrity.status === "blocked" ? "danger" : "warning"} className="w-fit uppercase tracking-[0.12em]">
            {integrity.status}
          </Badge>
          {integrity.checks.map((check) => (
            <div key={check.label} className="flex items-start gap-3 rounded-[4px] border border-[var(--border)] p-3">
              {check.status === "pass" ? <CheckCircle2 size={17} className="mt-0.5 text-[var(--success)]" /> : <AlertTriangle size={17} className="mt-0.5 text-[var(--warning)]" />}
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">{check.label}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DiffRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-[var(--border)] p-3">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}
