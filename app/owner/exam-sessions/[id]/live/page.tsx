import { notFound } from "next/navigation";
import { applyLiveInterventionAction, sendSessionBroadcastAction } from "@/app/owner/exam-sessions/[id]/live/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionHeading } from "@/components/section-heading";
import { getLiveSessionAttempts, getLiveSessionMessages, getOwnerExamSession } from "@/lib/examsim/session-data";

export default async function OwnerExamSessionLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, attempts, messages] = await Promise.all([getOwnerExamSession(id), getLiveSessionAttempts(id), getLiveSessionMessages(id)]);
  if (!session) notFound();
  return (
    <>
      <SectionHeading title="Live roster" description={`Monitor joined students, upload progress, and server-computed attempt states for ${session.title}.`} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable headers={["Student", "State", "Uploads", "Identity", "Actions"]}>
          {attempts.map((row) => {
            const uploaded = row.uploadSlots.filter((slot) => slot.status === "uploaded" || slot.status === "blank_placeholder").length;
            return (
              <DataTableRow key={row.attempt.id}>
                <DataTableCell>
                  <p className="font-semibold text-[var(--ink)]">{row.studentName}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">{row.studentNumber ?? row.attempt.id}</p>
                </DataTableCell>
                <DataTableCell><StatusBadge status={row.state} /></DataTableCell>
                <DataTableCell>{uploaded}/{row.uploadSlots.length}</DataTableCell>
                <DataTableCell>{row.attempt.identity_review_status ?? "not_required"}</DataTableCell>
                <DataTableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    <form action={applyLiveInterventionAction.bind(null, id, row.attempt.id, "extra_time")}>
                      <input type="hidden" name="extra_seconds" value="600" />
                      <Button type="submit" variant="secondary">+10m</Button>
                    </form>
                    <form action={applyLiveInterventionAction.bind(null, id, row.attempt.id, row.attempt.paused_at ? "resume" : "pause")}><Button type="submit" variant="secondary">{row.attempt.paused_at ? "Resume" : "Pause"}</Button></form>
                    <form action={applyLiveInterventionAction.bind(null, id, row.attempt.id, "force_submit")}><Button type="submit" variant="dangerSubtle">Force submit</Button></form>
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
                </div>
              )) : <p className="text-sm text-[var(--muted)]">No chat or issue messages yet.</p>}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
