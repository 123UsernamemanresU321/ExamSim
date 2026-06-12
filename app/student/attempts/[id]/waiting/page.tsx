import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BookOpenCheck, Clock3, HelpCircle, Laptop, LockKeyhole, ShieldCheck } from "lucide-react";
import { CountdownTimer } from "@/components/countdown-timer";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StudentMaterialsDrawer } from "@/components/student/allowed-materials-drawer";
import { formatInTimezone } from "@/lib/attempt-state";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { getStudentMaterialsForAttempt } from "@/lib/student-experience";

export default async function WaitingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { attempt } = await getAttemptScreenData(id, false);

  if (attempt.state === "ACTIVE") redirect(`/student/attempts/${id}/exam`);
  if (attempt.state === "UPLOAD_ONLY") redirect(`/student/attempts/${id}/upload`);
  if (attempt.state === "FINISHED_REVIEW") redirect(`/student/attempts/${id}/finished`);
  const materials = await getStudentMaterialsForAttempt(id);

  return (
    <div className="mx-auto grid max-w-[1120px] gap-6 px-2 py-4">
      <Card className="overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-8 p-6 md:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-[2px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                <LockKeyhole size={14} aria-hidden="true" />
                Waiting room
              </span>
              <span className="text-sm font-medium text-[var(--muted)]">
                Starts {formatInTimezone(attempt.start_at_utc, attempt.display_timezone)}
              </span>
            </div>

            <div>
              <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-5xl">
                Waiting room: your exam opens soon.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
                {attempt.title} is not available yet. Keep this page open; when the timer reaches zero, the exam workspace will unlock automatically.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]" aria-label="Exam details">
                <h2 className="font-semibold text-[var(--ink)]">{attempt.title}</h2>
                <span aria-hidden="true">/</span>
                <code className="rounded-[2px] bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-xs">{attempt.paper_code || "General"}</code>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <PrepCard
                icon={<Laptop size={18} aria-hidden="true" />}
                title="Check your setup"
                copy="Confirm your device, browser, and internet are ready before the exam starts."
              />
              <PrepCard
                icon={<BookOpenCheck size={18} aria-hidden="true" />}
                title="Review materials"
                copy={materials.length ? "Open any resources your teacher has allowed for this exam." : "No extra materials are listed for this exam."}
              />
              <PrepCard
                icon={<ShieldCheck size={18} aria-hidden="true" />}
                title="Stay on this page"
                copy="The paper is locked until start time. Refreshing is not needed."
              />
            </div>

            <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-6">
              <ButtonLink href={`/student/attempts/${id}/readiness`} variant="primary">
                <Laptop size={16} aria-hidden="true" />
                Run readiness check
              </ButtonLink>
              <ButtonLink href={`/student/attempts/${id}/recovery-status`} variant="secondary">
                <HelpCircle size={16} aria-hidden="true" />
                Report technical issue
              </ButtonLink>
            </div>
          </div>

          <aside className="border-t border-[var(--border)] bg-[var(--sidebar)] p-6 text-white lg:border-l lg:border-t-0 md:p-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
              <Clock3 size={14} aria-hidden="true" />
              Time left
            </div>
            <div className="mt-5 rounded-[4px] border border-white/10 bg-white/[0.08] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
              <CountdownTimer
                serverNowUtc={attempt.server_now_utc}
                targetUtc={attempt.countdown_target_utc}
                state={attempt.state}
              />
            </div>
            <div className="mt-6 grid gap-3 text-sm leading-6 text-slate-300">
              <p className="font-semibold text-white">Before the exam starts</p>
              <ul className="grid gap-2">
                <li className="flex gap-2"><span aria-hidden="true">-</span><span>Keep your charger and scan/upload device nearby.</span></li>
                <li className="flex gap-2"><span aria-hidden="true">-</span><span>Close unrelated tabs and apps.</span></li>
                <li className="flex gap-2"><span aria-hidden="true">-</span><span>Tell someone now if something is not working.</span></li>
              </ul>
            </div>
          </aside>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <StudentMaterialsDrawer materials={materials} />
      </div>
    </div>
  );
}

function PrepCard({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <section className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <span className="grid size-9 place-items-center rounded-[2px] border border-[var(--border)] bg-white text-[var(--primary)]">{icon}</span>
      <h2 className="mt-4 text-sm font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{copy}</p>
    </section>
  );
}
