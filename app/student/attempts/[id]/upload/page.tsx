import { redirect } from "next/navigation";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { CountdownTimer } from "@/components/countdown-timer";
import { QuestionPaper } from "@/components/question-paper";
import { SectionHeading } from "@/components/section-heading";
import { StudentMaterialsDrawer } from "@/components/student/allowed-materials-drawer";
import { UploadSlotCard } from "@/components/upload-slot-card";
import { flattenQuestionNodes } from "@/lib/assessment-package";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { getStudentMaterialsForAttempt } from "@/lib/student-experience";
import { collectUploadSlotNodeIds } from "@/lib/upload-slots";

export default async function UploadOnlyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { attempt, package: assessmentPackage, assetUrls, stateToken, responses, annotations, uploadSlots } = await getAttemptScreenData(id, true);

  if (attempt.state === "WAITING") redirect(`/student/attempts/${id}/waiting`);
  if (attempt.state === "ACTIVE") redirect(`/student/attempts/${id}/exam`);
  if (attempt.state === "FINISHED_REVIEW") redirect(`/student/attempts/${id}/finished`);

  const rootUploadNodeIds = assessmentPackage ? new Set(collectUploadSlotNodeIds(assessmentPackage.questions)) : new Set<string>();
  const uploadNodes = assessmentPackage
    ? flattenQuestionNodes(assessmentPackage.questions).filter((node) => rootUploadNodeIds.has(node.node_id))
    : [];
  const materials = await getStudentMaterialsForAttempt(id);
  return (
    <>
      <SectionHeading
        title="Upload only"
        description="Writing time has ended. Typed writing is disabled; upload slots remain available until the server deadline."
      />
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-xl border-l-4 border-l-[var(--warning)] border border-[var(--border)] bg-[var(--warning-bg)] p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-[var(--warning)]/10 p-2 border border-[var(--warning)]/20">
            <AttemptStateBadge state="UPLOAD_ONLY" />
          </div>
          <div>
            <h2 className="font-bold text-[var(--gold)]">Writing Window Closed</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">All text answers are locked. Please complete your PDF uploads before the server deadline.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-[var(--border)] shadow-sm shrink-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Upload Time Remaining:</span>
          <CountdownTimer
            serverNowUtc={attempt.server_now_utc}
            targetUtc={attempt.countdown_target_utc}
            state="UPLOAD_ONLY"
          />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(620px,840px)_380px] xl:justify-center">
        {assessmentPackage ? (
          <QuestionPaper
            questions={assessmentPackage.questions}
            attemptId={id}
            stateToken={stateToken}
            assetUrls={assetUrls}
            responses={responses}
            annotations={annotations}
            uploadSlots={uploadSlots}
            readonly
          />
        ) : null}
        <aside className="grid content-start gap-3 xl:sticky xl:top-24" aria-label="Upload slots">
          <StudentMaterialsDrawer materials={materials} />
          <div className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-6 text-[var(--muted)]">
            One PDF per main question. Include every subpart in that single file and label subquestions clearly.
            Blank placeholders are recorded as moderation-visible submission choices, not hidden failures.
          </div>
          {uploadNodes.length === 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm text-[var(--muted)]">
              No upload slots are available.
            </div>
          ) : (
            uploadNodes.map((node) => (
              <UploadSlotCard
                key={node.node_id}
                attemptId={id}
                questionNodeId={node.node_id}
                questionKey={node.node_key}
                stateToken={stateToken}
                status="pending"
                slot={uploadSlots.find((slot) => slot.question_node_id === node.node_id)}
              />
            ))
          )}
        </aside>
      </div>
    </>
  );
}
