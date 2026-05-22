import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileWarning, ShieldCheck } from "lucide-react";
import { getAssessmentHealthWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export default async function AssessmentHealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAssessmentHealthWorkspace(id);

  if (!workspace.assessment) {
    return (
      <main className="p-8">
        <Card className="p-8">
          <h1 className="text-xl font-black text-[var(--ink)]">Assessment not found</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">The health dashboard could not load this assessment.</p>
        </Card>
      </main>
    );
  }

  const { summary } = workspace;

  return (
    <main className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">Paper Health</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--ink)]">{workspace.assessment.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Checks parser structure, source context, markscheme mapping, delivery readiness, marking setup, and security assumptions before reuse or publishing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href={`/owner/assessments/${id}/review`} variant="secondary">Review parser warnings</ButtonLink>
          <ButtonLink href={`/owner/assessments/${id}/health`}>Run health check</ButtonLink>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div>
            <div className="text-5xl font-black tabular-nums text-[var(--ink)]">{summary.score}</div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--subtle)]">Health score</p>
            <StatusPill status={summary.status} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(summary.checks).map(([label, status]) => (
              <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                <p className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">{label}</p>
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
            <h2 className="font-black text-[var(--ink)]">Security health assumptions</h2>
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
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="font-black text-[var(--ink)]">{title}</h2>
      </div>
      {issues.length ? (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div key={`${issue.code}:${issue.message}`} className="rounded-lg border border-[var(--border)] bg-white p-4">
              <p className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">{issue.code.replaceAll("_", " ")}</p>
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
        <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">{empty}</div>
      )}
    </Card>
  );
}

function StatusPill({ status, compact = false }: { status: string; compact?: boolean }) {
  const tone =
    status === "ready"
      ? "border-green-200 bg-green-50 text-green-800"
      : status === "blocked"
        ? "border-red-200 bg-red-50 text-red-800"
        : status === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest ${tone}`}>
      {status === "ready" ? <CheckCircle2 size={13} /> : null}
      {compact ? status : status.replaceAll("_", " ")}
    </span>
  );
}
