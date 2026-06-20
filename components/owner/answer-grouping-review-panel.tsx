import {
  applyAnswerGroupingRunAction,
  approveAnswerGroupAction,
  createAnswerGroupingRunAction,
  mergeAnswerGroupsAction,
  moveAnswerGroupMemberAction,
  splitAnswerGroupMemberAction,
} from "@/app/owner/assessments/[id]/cross-mark/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AnswerGroupingReviewState } from "@/lib/examsim/answer-grouping-data";

export function AnswerGroupingReviewPanel({
  assessmentId,
  questionNodeId,
  questionMaximum,
  review,
  memberLabels,
}: {
  assessmentId: string;
  questionNodeId: string;
  questionMaximum: number | null;
  review: AnswerGroupingReviewState | null;
  memberLabels: Record<string, string>;
}) {
  if (!review) {
    return (
      <section className="border-t border-[var(--border)] pt-5">
        <h2 className="text-lg font-semibold">Answer group review</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Create a deterministic draft, then review every response before applying marks. No group is graded automatically.
        </p>
        <form action={createAnswerGroupingRunAction.bind(null, assessmentId, questionNodeId)} className="mt-4">
          <Button type="submit">Create review groups</Button>
        </form>
      </section>
    );
  }

  const { run, groups, members, auditEvents } = review;
  const editable = run.status === "draft" || run.status === "reviewed";
  const approvedCount = groups.filter((group) => group.approved).length;

  return (
    <section className="border-t border-[var(--border)] pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Answer group review</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {approvedCount} of {groups.length} groups approved · {members.length} responses accounted for
          </p>
        </div>
        <Badge tone={run.status === "applied" ? "success" : run.status === "reviewed" ? "info" : "warning"}>
          {run.status}
        </Badge>
      </div>

      {questionMaximum === null ? (
        <p className="mt-4 rounded-[4px] border border-[var(--warning)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning-ink)]">
          Set the question maximum before approving grouped marks.
        </p>
      ) : null}

      {editable && groups.length > 1 ? (
        <form action={mergeAnswerGroupsAction.bind(null, run.id)} className="mt-4 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <p className="text-xs font-semibold uppercase text-[var(--subtle)]">Merge selected groups</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {groups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 text-xs text-[var(--ink)]">
                <input type="checkbox" name="group_id" value={group.id} />
                Group {group.ordinal + 1}
              </label>
            ))}
          </div>
          <Button className="mt-3" type="submit" variant="secondary">Merge groups</Button>
        </form>
      ) : null}

      <div className="mt-4 grid gap-3">
        {groups.map((group) => {
          const groupMembers = members.filter((member) => member.group_id === group.id);
          return (
            <article key={group.id} className="rounded-[4px] border border-[var(--border)] bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{group.label}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Group {group.ordinal + 1} · {groupMembers.length} responses · {group.confidence.replaceAll("_", " ")}</p>
                </div>
                <Badge tone={group.approved ? "success" : group.confidence === "manual_review" ? "warning" : "neutral"}>
                  {group.approved ? `${group.suggested_awarded_marks} marks` : "Review"}
                </Badge>
              </div>

              <div className="mt-3 grid gap-2">
                {groupMembers.map((member) => (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] bg-[var(--surface-muted)] px-3 py-2">
                    <div>
                      <p className="text-xs font-semibold text-[var(--ink)]">{memberLabels[member.attempt_id] ?? `Script ${member.attempt_id.slice(0, 8)}`}</p>
                      <p className="mt-0.5 max-w-[240px] truncate text-xs text-[var(--muted)]">{member.original_normalized_answer || "Blank response"}</p>
                    </div>
                    {editable ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {groups.length > 1 ? (
                          <form action={moveAnswerGroupMemberAction.bind(null, run.id, member.id)} className="flex items-center gap-2">
                            <select name="target_group_id" defaultValue={group.id} className="min-h-8 rounded-[2px] border border-[var(--border)] bg-white px-2 text-xs">
                              {groups.map((target) => <option key={target.id} value={target.id}>Group {target.ordinal + 1}</option>)}
                            </select>
                            <Button type="submit" variant="ghost">Move</Button>
                          </form>
                        ) : null}
                        {groupMembers.length > 1 ? (
                          <form action={splitAnswerGroupMemberAction.bind(null, run.id, member.id)}>
                            <Button type="submit" variant="ghost">Split</Button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {editable ? (
                <form action={approveAnswerGroupAction.bind(null, group.id)} className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3">
                  <label className="grid gap-1 text-xs font-semibold text-[var(--ink)]">
                    Awarded marks
                    <input
                      name="suggested_awarded_marks"
                      type="number"
                      min="0"
                      max={questionMaximum ?? undefined}
                      step="0.5"
                      required
                      defaultValue={group.suggested_awarded_marks ?? ""}
                      className="min-h-9 rounded-[2px] border border-[var(--border)] px-3 text-sm"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-[var(--ink)]">
                    Feedback applied to this group
                    <textarea
                      name="feedback_text"
                      maxLength={2000}
                      defaultValue={group.feedback_text ?? ""}
                      className="min-h-20 rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm font-normal"
                      placeholder="Optional marker-reviewed feedback"
                    />
                  </label>
                  <Button type="submit" variant={group.approved ? "secondary" : "primary"}>{group.approved ? "Update approval" : "Approve group"}</Button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>

      {run.status === "reviewed" ? (
        <form action={applyAnswerGroupingRunAction.bind(null, run.id)} className="mt-4 rounded-[4px] border border-[var(--primary)] bg-[var(--info-bg)] p-3">
          <p className="text-sm font-semibold text-[var(--ink)]">All groups are approved.</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Applying writes one marker-owned question mark per grouped response and records an audit event.</p>
          <Button className="mt-3" type="submit">Apply reviewed marks</Button>
        </form>
      ) : null}

      {auditEvents.length ? (
        <details className="mt-4 text-xs text-[var(--muted)]">
          <summary className="cursor-pointer font-semibold text-[var(--ink)]">Review audit history</summary>
          <div className="mt-2 grid gap-1">
            {auditEvents.map((event) => <p key={event.id}>{new Date(event.created_at).toLocaleString()} · {event.event_type.replaceAll("_", " ")}</p>)}
          </div>
        </details>
      ) : null}
    </section>
  );
}
