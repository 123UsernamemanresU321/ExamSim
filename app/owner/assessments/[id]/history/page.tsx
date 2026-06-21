import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";
import { buildAssessmentVersionDiff } from "@/lib/examsim/version-governance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { duplicateAssessmentVersionAsDraftAction } from "./actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function AssessmentVersionHistoryPage({ params, searchParams }: PageProps) {
  const { id: assessmentId } = await params;
  const comparison = await searchParams;
  const context = await requireInstitutionPagePermission("assessment_authoring", `/owner/assessments/${assessmentId}/history`);
  const supabase = await createSupabaseServerClient();

  const [{ data: assessment, error: assessmentError }, { data: versions, error: versionsError }] = await Promise.all([
    supabase.from("assessments").select("id,title,paper_code").eq("id", assessmentId).eq("owner_profile_id", context.ownerProfileId).maybeSingle(),
    supabase
      .from("assessment_versions")
      .select("id,version_no,status,source_kind,parse_confidence,requires_owner_review,published_at,created_at")
      .eq("assessment_id", assessmentId)
      .order("version_no", { ascending: false }),
  ]);
  if (assessmentError) throw assessmentError;
  if (versionsError) throw versionsError;
  if (!assessment) return <SectionHeading title="Assessment not found" description="This assessment is unavailable in your institution workspace." />;

  const versionRows = versions ?? [];
  const defaultTo = versionRows[0]?.id;
  const defaultFrom = versionRows[1]?.id;
  const fromVersionId = versionRows.some((version) => version.id === comparison.from) ? comparison.from : defaultFrom;
  const toVersionId = versionRows.some((version) => version.id === comparison.to) ? comparison.to : defaultTo;
  const selectedVersionIds = [fromVersionId, toVersionId].filter((value): value is string => Boolean(value));
  const diffData = selectedVersionIds.length === 2
    ? await loadVersionDiffData(supabase, selectedVersionIds)
    : null;
  const versionDiff = diffData && fromVersionId && toVersionId
    ? buildAssessmentVersionDiff({
        fromQuestions: diffData.questions.filter((question) => question.assessment_version_id === fromVersionId),
        toQuestions: diffData.questions.filter((question) => question.assessment_version_id === toVersionId),
        fromRegionCount: diffData.regions.filter((region) => region.assessment_version_id === fromVersionId).length,
        toRegionCount: diffData.regions.filter((region) => region.assessment_version_id === toVersionId).length,
        fromRubricMarks: sumRubricMarks(diffData.rubrics, fromVersionId),
        toRubricMarks: sumRubricMarks(diffData.rubrics, toVersionId),
        fromTopicKeys: topicKeysForVersion(diffData.topicLinks, fromVersionId),
        toTopicKeys: topicKeysForVersion(diffData.topicLinks, toVersionId),
      })
    : null;
  const fromVersion = versionRows.find((version) => version.id === fromVersionId);
  const toVersion = versionRows.find((version) => version.id === toVersionId);

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Version history"
        description={`${assessment.title} · Published versions stay frozen. Restore work by duplicating a historical version into a new draft.`}
      />

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/owner/assessments/${assessmentId}`} variant="secondary">Assessment overview</ButtonLink>
        <ButtonLink href={`/owner/assessments/${assessmentId}/authoring`}>Open latest editor</ButtonLink>
      </div>

      {versionRows.length === 0 ? (
        <Card>
          <h2 className="text-base font-semibold">No versions yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Create or import an assessment source to establish the first draft.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-base font-semibold">Assessment versions</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Choose two versions to compare. Restoring always creates a separate draft.</p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {versionRows.map((version, index) => {
              const previous = versionRows[index + 1];
              return (
                <div key={version.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Version {version.version_no}</span>
                      <Badge tone={statusTone(version.status)}>{version.status.replaceAll("_", " ")}</Badge>
                      <span className="text-xs text-[var(--muted)]">{version.source_kind.toUpperCase()}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Created {formatDate(version.created_at)}{version.published_at ? ` · Published ${formatDate(version.published_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {previous ? (
                      <ButtonLink href={`/owner/assessments/${assessmentId}/history?from=${previous.id}&to=${version.id}`} variant="secondary">
                        Compare with v{previous.version_no}
                      </ButtonLink>
                    ) : null}
                    <form action={duplicateAssessmentVersionAsDraftAction.bind(null, assessmentId, version.id)}>
                      <Button type="submit" variant="subtle">Duplicate as new draft</Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {versionDiff && fromVersion && toVersion ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Version {fromVersion.version_no} → Version {toVersion.version_no}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Field-level summary for teacher review. This comparison never changes either version.</p>
            </div>
            <Badge tone={versionDiff.changedFields.length ? "warning" : "success"}>
              {versionDiff.changedFields.length ? `${versionDiff.changedFields.length} areas changed` : "No tracked changes"}
            </Badge>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <DiffList title="Changed areas" values={versionDiff.changedFields.map(formatField)} empty="No tracked fields changed." />
            <DiffList title="Changed questions" values={versionDiff.changedQuestionKeys} empty="No question-card changes detected." />
            <DiffList title="Added questions" values={versionDiff.addedQuestionKeys} empty="No questions added." />
            <DiffList title="Removed questions" values={versionDiff.removedQuestionKeys} empty="No questions removed." />
          </div>
        </Card>
      ) : null}

      <p className="text-xs leading-5 text-[var(--muted)]">
        Source files may be shared by immutable versions. Deleting a draft source never removes an object still referenced by another version.
      </p>
    </div>
  );
}

async function loadVersionDiffData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  versionIds: string[],
) {
  const questionsResult = await supabase
    .from("question_nodes")
    .select("id,assessment_version_id,node_key,title,marks,response_mode,prompt_html,prompt_latex")
    .in("assessment_version_id", versionIds);
  if (questionsResult.error) throw questionsResult.error;
  const questions = questionsResult.data ?? [];
  const questionIds = questions.map((question) => question.id);
  const [regionsResult, rubricsResult, topicLinksResult] = await Promise.all([
    supabase.from("question_source_regions").select("assessment_version_id").in("assessment_version_id", versionIds),
    supabase.from("rubrics").select("assessment_version_id,total_marks").in("assessment_version_id", versionIds),
    questionIds.length
      ? supabase.from("question_topic_links").select("question_node_id,topic_tag_id").in("question_node_id", questionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (regionsResult.error) throw regionsResult.error;
  if (rubricsResult.error) throw rubricsResult.error;
  if (topicLinksResult.error) throw topicLinksResult.error;
  const topicTagIds = Array.from(new Set((topicLinksResult.data ?? []).map((link) => link.topic_tag_id)));
  const topicTagsResult = topicTagIds.length
    ? await supabase.from("topic_tags").select("id,subject,tag").in("id", topicTagIds)
    : { data: [], error: null };
  if (topicTagsResult.error) throw topicTagsResult.error;
  const questionVersionById = new Map(questions.map((question) => [question.id, question.assessment_version_id]));
  const topicTagById = new Map((topicTagsResult.data ?? []).map((tag) => [tag.id, tag]));
  return {
    questions,
    regions: regionsResult.data ?? [],
    rubrics: rubricsResult.data ?? [],
    topicLinks: (topicLinksResult.data ?? []).flatMap((link) => {
      const assessmentVersionId = questionVersionById.get(link.question_node_id);
      const tag = topicTagById.get(link.topic_tag_id);
      return assessmentVersionId && tag
        ? [{ assessment_version_id: assessmentVersionId, subject: tag.subject, tag: tag.tag }]
        : [];
    }),
  };
}

function sumRubricMarks(rows: Array<{ assessment_version_id: string; total_marks: number }>, versionId: string) {
  return rows.filter((row) => row.assessment_version_id === versionId).reduce((total, row) => total + Number(row.total_marks), 0);
}

function topicKeysForVersion(
  rows: Array<{ assessment_version_id: string; subject: string; tag: string }>,
  versionId: string,
) {
  return rows
    .filter((row) => row.assessment_version_id === versionId)
    .map((row) => `${row.subject}:${row.tag}`);
}

function DiffList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div className="border-t border-[var(--border)] pt-3">
      <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">{title}</h3>
      {values.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => <li key={value}><Badge>{value}</Badge></li>)}
        </ul>
      ) : <p className="mt-2 text-sm text-[var(--muted)]">{empty}</p>}
    </div>
  );
}

function statusTone(status: string): "neutral" | "warning" | "success" {
  if (status === "published") return "success";
  if (status === "review_required") return "warning";
  return "neutral";
}

function formatField(field: string) {
  return field.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
