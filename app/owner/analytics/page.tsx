import { AlertTriangle, BarChart3, CheckCircle2, FileText, Tags } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { computeTeacherAnalyticsSnapshot, type TeacherAnalyticsSnapshot } from "@/lib/examsim/analytics";
import { listOwnerAssessments, listOwnerAttempts, listOwnerStudents, type AttemptSummary } from "@/lib/live-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OwnerAnalyticsPage() {
  const [assessments, attempts, students] = await Promise.all([
    listOwnerAssessments(),
    listOwnerAttempts(),
    listOwnerStudents(),
  ]);
  const analyticsSnapshot = await loadAnalyticsSnapshot(assessments.map((assessment) => ({
    id: assessment.id,
    latestVersionId: assessment.latest_version_id,
  })), attempts);
  const finishedAttempts = attempts.filter((attempt) => attempt.state === "FINISHED_REVIEW");
  const activeAttempts = attempts.filter((attempt) => attempt.state === "ACTIVE" || attempt.state === "UPLOAD_ONLY");
  const publishedAssessments = assessments.filter((assessment) => assessment.latest_status === "published");

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Review"
        title="Analytics / Performance"
        description="A compact review hub for released work, assessment coverage, topics, and recurring error patterns."
        actions={
          <>
            <ButtonLink href="/owner/topics" variant="secondary">
              <Tags size={16} aria-hidden="true" />
              Topics
            </ButtonLink>
            <ButtonLink href="/owner/mistakes" variant="secondary">
              <AlertTriangle size={16} aria-hidden="true" />
              Error Patterns
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Managed students" value={students.length} icon={<BarChart3 size={18} aria-hidden="true" />} />
        <StatCard label="Published assessments" value={publishedAssessments.length} icon={<FileText size={18} aria-hidden="true" />} />
        <StatCard label="Finished scripts" value={finishedAttempts.length} tone={finishedAttempts.length ? "success" : "neutral"} icon={<CheckCircle2 size={18} aria-hidden="true" />} />
        <StatCard label="Still in flight" value={activeAttempts.length} tone={activeAttempts.length ? "warning" : "neutral"} icon={<AlertTriangle size={18} aria-hidden="true" />} />
      </div>

      <AnalyticsSnapshotPanel snapshot={analyticsSnapshot} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-6">
          <SectionHeader
            title="Recent assessment coverage"
            description="Use this as the review entry point after marking and feedback release."
          />
          {assessments.length ? (
            <DataList className="mt-4">
              {assessments.slice(0, 8).map((assessment) => (
                <DataListRow key={assessment.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--ink)]">{assessment.title}</p>
                    <DataListMeta className="mt-1">
                      <span>{assessment.paper_code ?? "No paper code"}</span>
                      <span>{assessment.assessment_kind}</span>
                      <span>{assessment.latest_status ?? "draft"}</span>
                    </DataListMeta>
                  </div>
                  <ButtonLink href={`/owner/assessments/${assessment.id}`} variant="secondary">
                    Open
                  </ButtonLink>
                </DataListRow>
              ))}
            </DataList>
          ) : (
            <EmptyState title="No assessments yet" description="Build and publish an assessment before analytics can summarize performance." />
          )}
        </Card>

        <Card className="p-6">
          <SectionHeader title="Review tools" description="Focused pages for learning evidence and marking patterns." />
          <div className="mt-4 grid gap-3">
            <ButtonLink href="/owner/topics" variant="secondary" className="justify-start">
              <Tags size={16} aria-hidden="true" />
              Topic tagging and skills
            </ButtonLink>
            <ButtonLink href="/owner/mistakes" variant="secondary" className="justify-start">
              <AlertTriangle size={16} aria-hidden="true" />
              Error pattern taxonomy
            </ButtonLink>
            <ButtonLink href="/owner/feedback-releases" variant="secondary" className="justify-start">
              <CheckCircle2 size={16} aria-hidden="true" />
              Feedback release status
            </ButtonLink>
          </div>
        </Card>
      </div>
    </main>
  );
}

async function loadAnalyticsSnapshot(assessmentVersions: Array<{ id: string; latestVersionId: string | null }>, attempts: AttemptSummary[]) {
  try {
    const supabase = await createSupabaseServerClient();
    const versionToAssessment = new Map(assessmentVersions.filter((item) => item.latestVersionId).map((item) => [String(item.latestVersionId), item.id]));
    const versionIds = [...versionToAssessment.keys()];
    const [{ data: questionRows, error: questionError }] = await Promise.all([
      versionIds.length
        ? supabase.from("question_nodes").select("id,assessment_version_id,node_key,title,marks,response_mode").in("assessment_version_id", versionIds)
        : { data: [], error: null },
    ]);
    if (questionError) throw questionError;

    const attemptIds = attempts.map((attempt) => attempt.id);
    const questionIds = (questionRows ?? []).map((question) => question.id);
    const [{ data: markRows, error: markError }, { data: topicLinks, error: topicLinkError }, { data: rubricAwards, error: awardError }] = await Promise.all([
      attemptIds.length ? supabase.from("marks").select("attempt_id,question_node_id,awarded_marks").in("attempt_id", attemptIds) : { data: [], error: null },
      questionIds.length ? supabase.from("question_topic_links").select("question_node_id,topic_tag_id").in("question_node_id", questionIds) : { data: [], error: null },
      attemptIds.length ? supabase.from("rubric_item_awards").select("question_node_id,awarded_marks,rubric_template_item_id").in("attempt_id", attemptIds) : { data: [], error: null },
    ]);
    if (markError) throw markError;
    if (topicLinkError) throw topicLinkError;
    if (awardError) throw awardError;

    const topicIds = [...new Set((topicLinks ?? []).map((link) => link.topic_tag_id).filter(isString))];
    const rubricItemIds = [...new Set((rubricAwards ?? []).map((award) => award.rubric_template_item_id).filter(isString))];
    const [{ data: topicTags, error: topicTagError }, { data: rubricItems, error: rubricItemError }] = await Promise.all([
      topicIds.length ? supabase.from("topic_tags").select("id,tag").in("id", topicIds) : { data: [], error: null },
      rubricItemIds.length ? supabase.from("rubric_template_items").select("id,label,max_marks").in("id", rubricItemIds) : { data: [], error: null },
    ]);
    if (topicTagError) throw topicTagError;
    if (rubricItemError) throw rubricItemError;

    const topicTagById = new Map((topicTags ?? []).map((tag) => [tag.id, tag.tag]));
    const rubricItemById = new Map((rubricItems ?? []).map((item) => [item.id, item]));

    return computeTeacherAnalyticsSnapshot({
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        assessment_id: attempt.assessment_id,
        state: attempt.state,
        duration_seconds: attempt.duration_seconds,
      })),
      questionNodes: (questionRows ?? []).map((question) => ({
        id: question.id,
        assessment_id: versionToAssessment.get(question.assessment_version_id) ?? null,
        assessment_version_id: question.assessment_version_id,
        node_key: question.node_key,
        title: question.title,
        marks: question.marks,
        response_mode: question.response_mode,
      })),
      marks: (markRows ?? []).map((mark) => ({
        attempt_id: mark.attempt_id,
        question_node_id: mark.question_node_id,
        awarded_marks: Number(mark.awarded_marks ?? 0),
      })),
      topicLinks: (topicLinks ?? []).flatMap((link) => {
        const tag = topicTagById.get(link.topic_tag_id);
        return tag ? [{ question_node_id: link.question_node_id, tag }] : [];
      }),
      rubricAwards: (rubricAwards ?? []).map((award) => {
        const rubricItem = award.rubric_template_item_id ? rubricItemById.get(award.rubric_template_item_id) : null;
        return {
          question_node_id: award.question_node_id,
          awarded_marks: Number(award.awarded_marks ?? 0),
          max_marks: Number(rubricItem?.max_marks ?? 0),
          label: rubricItem?.label ?? "Rubric point",
        };
      }),
    });
  } catch {
    return null;
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function AnalyticsSnapshotPanel({ snapshot }: { snapshot: TeacherAnalyticsSnapshot | null }) {
  if (!snapshot) {
    return (
      <Card className="p-6">
        <SectionHeader title="V2 analytics snapshot" description="Stored marks could not be loaded for aggregate analytics. The rest of the review tools remain available." />
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <SectionHeader
          title="Score distribution"
          description={`Average released score ${snapshot.averagePercent === null ? "not available" : `${Math.round(snapshot.averagePercent)}%`} across ${snapshot.finishedAttemptCount} finished script(s).`}
        />
        <DataList className="mt-4">
          {snapshot.scoreDistribution.map((bucket) => (
            <DataListRow key={bucket.label} className="grid grid-cols-[1fr_auto] items-center">
              <span className="font-semibold text-[var(--ink)]">{bucket.label}</span>
              <span className="font-mono text-sm text-[var(--muted)]">{bucket.count}</span>
            </DataListRow>
          ))}
        </DataList>
      </Card>

      <Card className="p-6">
        <SectionHeader title="Weakest questions" description="Question difficulty based on stored marks and available max marks." />
        {snapshot.questionDifficulty.length ? (
          <DataList className="mt-4">
            {snapshot.questionDifficulty.slice(0, 5).map((question) => (
              <DataListRow key={question.questionNodeId} className="grid gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-[var(--ink)]">{question.nodeKey}</span>
                  <span className="font-mono text-sm text-[var(--muted)]">{question.averagePercent === null ? "n/a" : `${Math.round(question.averagePercent)}%`}</span>
                </div>
                <DataListMeta>
                  <span>{question.title ?? "Untitled question"}</span>
                  <span>{question.attempts} marked response(s)</span>
                </DataListMeta>
              </DataListRow>
            ))}
          </DataList>
        ) : <EmptyState title="No question difficulty yet" description="Mark at least one attempt to calculate question-level difficulty." />}
      </Card>

      <Card className="p-6">
        <SectionHeader title="Topic weaknesses" description="Weighted by awarded marks over available topic-linked marks." />
        {snapshot.topicWeaknesses.length ? (
          <DataList className="mt-4">
            {snapshot.topicWeaknesses.slice(0, 6).map((topic) => (
              <DataListRow key={topic.tag} className="grid grid-cols-[1fr_auto] items-center">
                <span className="font-semibold text-[var(--ink)]">{topic.tag}</span>
                <span className="font-mono text-sm text-[var(--muted)]">{topic.averagePercent === null ? "n/a" : `${Math.round(topic.averagePercent)}%`}</span>
              </DataListRow>
            ))}
          </DataList>
        ) : <EmptyState title="No topic data yet" description="Add topic tags to questions to unlock topic-level analytics." />}
      </Card>

      <Card className="p-6">
        <SectionHeader title="Rubric loss and support flags" description="Uses rubric awards and low-score flags from stored marking data." />
        <div className="mt-4 grid gap-4">
          {snapshot.rubricLossBreakdown.length ? (
            <DataList>
              {snapshot.rubricLossBreakdown.slice(0, 4).map((item) => (
                <DataListRow key={item.label} className="grid grid-cols-[1fr_auto] items-center">
                  <span className="font-semibold text-[var(--ink)]">{item.label}</span>
                  <span className="font-mono text-sm text-[var(--muted)]">{item.lostMarks}/{item.possibleMarks} lost</span>
                </DataListRow>
              ))}
            </DataList>
          ) : <p className="text-sm text-[var(--muted)]">No rubric-award loss data yet.</p>}
          <p className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted)]">
            {snapshot.studentSupportFlags.length} attempt(s) are currently flagged for low score support review.
          </p>
        </div>
      </Card>
    </div>
  );
}
