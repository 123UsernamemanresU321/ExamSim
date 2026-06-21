import { notFound } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { rotateExamSessionCodeAction, updateExamSessionStatusAction } from "@/app/owner/exam-sessions/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionHeading } from "@/components/section-heading";
import { getOwnerExamSession } from "@/lib/examsim/session-data";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";

export default async function OwnerExamSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new_code?: string }>;
}) {
  const { id } = await params;
  await requireInstitutionPagePermission("session_publishing", `/owner/exam-sessions/${id}`);
  const { new_code: newCode } = await searchParams;
  const session = await getOwnerExamSession(id);
  if (!session) notFound();
  const rotateAction = rotateExamSessionCodeAction.bind(null, id);

  return (
    <>
      <SectionHeading
        title={session.title}
        description="Manage the code, timing, share instructions, and live operations for this sitting."
        actions={<ButtonLink href={`/owner/exam-sessions/${id}/live`}>Open live roster</ButtonLink>}
      />
      {newCode ? (
        <Card className="mb-5 border-[var(--success)]/30 bg-[var(--success-bg)]">
          <p className="text-sm font-semibold text-[var(--ink)]">Copy this exam code now</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.1em] text-[var(--ink)]">{newCode}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">For security, only a hash and final hint are stored after this page load.</p>
        </Card>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Fact label="Status" value={<StatusBadge status={session.status} />} />
            <Fact label="Mode" value={session.mode} />
            <Fact label="Starts" value={new Date(session.start_at_utc).toLocaleString()} />
            <Fact label="Duration" value={`${Math.round(session.duration_seconds / 60)} minutes`} />
            <Fact label="Code hint" value={session.code_display_hint ?? "none"} />
            <Fact label="Attempt limit" value={`${session.attempt_limit_per_student}`} />
          </div>
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-[var(--ink)]">Actions</h2>
          <div className="mt-4 grid gap-2">
            <form action={rotateAction}>
              <Button type="submit" variant="secondary" className="w-full">
                <RotateCcw size={16} aria-hidden="true" />
                Rotate code
              </Button>
            </form>
            <form action={updateExamSessionStatusAction.bind(null, id, "closed")}>
              <Button type="submit" variant="dangerSubtle" className="w-full">Close session</Button>
            </form>
            <ButtonLink href={`/owner/exam-sessions/${id}/share`} variant="secondary" className="w-full">Share instructions</ButtonLink>
            <ButtonLink href={`/owner/exam-sessions/${id}/reconcile`} variant="secondary" className="w-full">Reconcile guests</ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <div className="mt-2 text-sm font-semibold text-[var(--ink)]">{value}</div>
    </div>
  );
}
