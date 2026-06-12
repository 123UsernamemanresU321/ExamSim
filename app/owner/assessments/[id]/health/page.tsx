import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileWarning, ShieldCheck } from "lucide-react";
import { getAssessmentHealthWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";

export default async function AssessmentHealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAssessmentHealthWorkspace(id);

  if (!workspace.assessment) {
    return (
      <main>
        <Card className="p-8">
          <h1 className="text-xl font-semibold text-[var(--ink)]">Assessment not found</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">The health dashboard could not load this assessment.</p>
        </Card>
      </main>
    );
  }

  const { summary } = workspace;

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Paper health"
        title={workspace.assessment.title}
        description="Checks parser structure, source context, markscheme mapping, delivery readiness, marking setup, and security assumptions before reuse or publishing."
        actions={
          <>
          <ButtonLink href={`/owner/assessments/${id}/review`} variant="secondary">Review parser warnings</ButtonLink>
          <ButtonLink href={`/owner/assessments/${id}/health`}>Run health check</ButtonLink>
          </>
        }
      />

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div>
            <div className="text-5xl font-semibold tabular-nums text-[var(--ink)]">{summary.score}</div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Health score</p>
            <StatusPill status={summary.status} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(summary.checks).map(([label, status]) => (
              <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">{label}</p>
                <StatusPill status={status} compact />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <IssueList title="Blockers" icon={<FileWarning size={18} />} issues={summary.blockers} empty="No blocking issues were found." />
        <IssueList title="Warnings" icon={<AlertTriangle size={18} />} issues={summary.warnings} empty="No warnings were found." />
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 text-[var(--primary)]" size={20} />
          <div>
            <h2 className="font-semibold text-[var(--ink)]">Security health assumptions</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              This dashboard checks application metadata only. Supabase buckets must remain private, RLS must remain enabled, and exam payloads still release only through server-computed attempt state.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}

function IssueList({
  title,
  icon,
  issues,
  empty,
}: {
  title: string;
  icon: ReactNode;
  issues: Array<{ code: string; message: string; fixHref?: string }>;
  empty: string;
}) {
  return (
    <Card className="p-6">
      <SectionHeader title={title} actions={icon} />
      {issues.length ? (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div key={`${issue.code}:${issue.message}`} className="rounded-lg border border-[var(--border)] bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">{issue.code.replaceAll("_", " ")}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{issue.message}</p>
              {issue.fixHref ? (
                <Link className="mt-3 inline-flex text-xs font-bold text-[var(--primary)] underline" href={issue.fixHref}>
                  Fix now
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={empty} description="No action is required for this section." />
      )}
    </Card>
  );
}

function StatusPill({ status, compact = false }: { status: string; compact?: boolean }) {
  const tone =
    status === "ready"
      ? "border-[var(--success)]/20 bg-[var(--success-bg)] text-[var(--success)]"
      : status === "blocked"
        ? "border-[var(--danger)]/20 bg-[var(--danger-bg)] text-[var(--danger)]"
        : status === "warning"
          ? "border-[var(--warning)]/20 bg-[var(--warning-bg)] text-[var(--warning)]"
          : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--subtle)]";
  return (
    <span className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${tone}`}>
      {status === "ready" ? <CheckCircle2 size={13} /> : null}
      {compact ? status : status.replaceAll("_", " ")}
    </span>
  );
}
