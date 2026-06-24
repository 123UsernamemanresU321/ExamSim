import { notFound } from "next/navigation";
import { applyLiveInterventionAction, sendPrivateInvigilationMessageAction, sendSessionBroadcastAction } from "@/app/owner/exam-sessions/[id]/live/actions";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionHeading } from "@/components/section-heading";
import { getLiveSessionAttempts, getLiveSessionMessages, getOwnerExamSession } from "@/lib/examsim/session-data";

export default async function OwnerExamSessionLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; risk?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const [session, attempts, messages] = await Promise.all([getOwnerExamSession(id), getLiveSessionAttempts(id), getLiveSessionMessages(id)]);
  if (!session) notFound();
  const query = String(filters.q ?? "").trim().toLowerCase();
  const risk = ["low", "medium", "high"].includes(String(filters.risk)) ? String(filters.risk) : "all";
  const visibleAttempts = attempts.filter((row) => {
    const matchesQuery = !query || `${row.studentName} ${row.studentNumber ?? ""}`.toLowerCase().includes(query);
    return matchesQuery && (risk === "all" || row.riskLevel === risk);
  });
  const highRiskCount = attempts.filter((row) => row.riskLevel === "high").length;
  const disconnectedCount = attempts.filter((row) => row.heartbeatGapSeconds === null || row.heartbeatGapSeconds > 120).length;
  const pausedCount = attempts.filter((row) => row.state === "PAUSED").length;
  return (
    <>
      <Breadcrumb
        items={[
          { label: "Exam Sessions", href: "/owner/exam-sessions" },
          { label: session.title, href: `/owner/exam-sessions/${id}` },
          { label: "Live Roster" },
        ]}
      />
      <SectionHeading title="Live roster" description={`Monitor joined students, upload progress, and server-computed attempt states for ${session.title}.`} />
      <section className="mb-5 border-y border-[var(--border)] bg-white px-4 py-4" aria-labelledby="risk-overview-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="risk-overview-heading" className="text-sm font-semibold text-[var(--ink)]">Risk overview</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Signals support invigilation review; they are not proof of misconduct.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span><strong>{attempts.length}</strong> joined</span>
            <span><strong>{highRiskCount}</strong> high risk</span>
            <span><strong>{disconnectedCount}</strong> disconnected</span>
            <span><strong>{pausedCount}</strong> paused</span>
          </div>
        </div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
          <input name="q" defaultValue={filters.q ?? ""} placeholder="Search student or number" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
          <select name="risk" defaultValue={risk} className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
            <option value="all">All risk levels</option><option value="high">High risk</option><option value="medium">Medium risk</option><option value="low">Low risk</option>
          </select>
          <Button type="submit" variant="secondary">Apply filters</Button>
        </form>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable headers={["Student", "State", "Progress", "Reliability", "Actions"]}>
          {visibleAttempts.map((row) => {
            const uploaded = row.uploadSlots.filter((slot) => slot.status === "uploaded" || slot.status === "blank_placeholder").length;
            const heartbeatTone = row.heartbeatGapSeconds === null
              ? "neutral"
              : row.heartbeatGapSeconds > 120
                ? "danger"
                : row.heartbeatGapSeconds > 45
                  ? "warning"
                  : "success";
            return (
              <DataTableRow key={row.attempt.id}>
                <DataTableCell>
                  <p className="font-semibold text-[var(--ink)]">{row.studentName}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">{row.studentNumber ?? row.attempt.id}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Identity: {row.attempt.identity_review_status ?? "not_required"}</p>
                </DataTableCell>
                <DataTableCell><StatusBadge status={row.state} /></DataTableCell>
                <DataTableCell>
                  <p className="text-sm font-semibold text-[var(--ink)]">{uploaded}/{row.uploadSlots.length} uploads</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{row.responseCount} typed response{row.responseCount === 1 ? "" : "s"}</p>
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">Current: {row.currentQuestionKey ?? "unknown"}</p>
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={heartbeatTone === "danger" ? "requires_review" : heartbeatTone === "warning" ? "warning" : "complete"} />
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Heartbeat: {row.heartbeatGapSeconds === null ? "not seen" : `${row.heartbeatGapSeconds}s ago`}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Last: {row.lastEventType ?? "no events"}{row.lastEventAt ? ` · ${new Date(row.lastEventAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Risk: <strong className="text-[var(--ink)]">{row.riskLevel}</strong> · hidden {row.visibilityHiddenCount} · blur {row.windowBlurCount}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Announcements acknowledged: {row.acknowledgementCount}</p>
                  {row.technicalIssueCount ? <p className="mt-1 text-xs font-semibold text-amber-700">{row.technicalIssueCount} issue report{row.technicalIssueCount === 1 ? "" : "s"}</p> : null}
                </DataTableCell>
                <DataTableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    <form action={applyLiveInterventionAction.bind(null, id, row.attempt.id, "extra_time")}>
                      <input type="hidden" name="extra_seconds" value="600" />
                      <Button type="submit" variant="secondary">+10m</Button>
                    </form>
                    <form action={applyLiveInterventionAction.bind(null, id, row.attempt.id, row.attempt.paused_at ? "resume" : "pause")}><Button type="submit" variant="secondary">{row.attempt.paused_at ? "Resume" : "Pause"}</Button></form>
                    <form action={applyLiveInterventionAction.bind(null, id, row.attempt.id, "force_submit")}><Button type="submit" variant="dangerSubtle">Force submit</Button></form>
                    <ButtonLink href={`/owner/attempts/${row.attempt.id}/report`} variant="secondary">Timeline</ButtonLink>
                  </div>
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </DataTable>
        <aside className="grid gap-4">
          <Card>
            <h2 className="text-base font-semibold text-[var(--ink)]">Broadcast</h2>
            <form action={sendSessionBroadcastAction.bind(null, id)} className="mt-3 grid gap-3">
              <textarea name="body" placeholder="Message to all joined students" className="min-h-28 rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
              <Button type="submit">Send broadcast</Button>
            </form>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-[var(--ink)]">Activity and chat</h2>
            <div className="mt-3 grid gap-3">
              {messages.length ? messages.map((message) => (
                <div key={message.id} className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{message.sender_kind} · {message.message_kind}</p>
                  <p className="mt-1 text-sm text-[var(--ink)]">{message.body}</p>
                  {message.message_kind === "broadcast" ? <p className="mt-2 text-xs text-[var(--muted)]">{message.acknowledgementCount} acknowledgement{message.acknowledgementCount === 1 ? "" : "s"}</p> : null}
                  {message.attempt_id && message.sender_kind !== "owner" ? (
                    <form action={sendPrivateInvigilationMessageAction.bind(null, id, message.attempt_id)} className="mt-3 grid gap-2">
                      <textarea name="body" placeholder="Private reply to this student" className="min-h-16 rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm" />
                      <Button type="submit" variant="secondary" className="justify-self-end">Reply privately</Button>
                    </form>
                  ) : null}
                </div>
              )) : <p className="text-sm text-[var(--muted)]">No chat or issue messages yet.</p>}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
