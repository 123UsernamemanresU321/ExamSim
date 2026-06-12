import { PublishAssessmentForm } from "@/components/owner/publish-assessment-form";
import { PublishDiffPanel } from "@/components/owner/publish-diff-panel";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { getAssessmentWorkspace, listOwnerStudentGroups, listOwnerStudents } from "@/lib/live-data";
import { getPackageIntegrityReport, getPublishDiffSummary } from "@/lib/owner-operations";
import { listAssessmentTemplates, listCohortsWithMembers } from "@/lib/usability-data";

export default async function PublishAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workspace, students, groups, templates, cohortWorkspace, publishDiff, integrity] = await Promise.all([
    getAssessmentWorkspace(id),
    listOwnerStudents(),
    listOwnerStudentGroups(),
    listAssessmentTemplates(),
    listCohortsWithMembers(),
    getPublishDiffSummary(id),
    getPackageIntegrityReport(id),
  ]);
  const version = workspace?.latestVersion;
  return (
    <>
      <SectionHeading
        title="Publish and assign"
        description={`Publish ${workspace?.assessment.title ?? id}. The server converts local start time to UTC and creates attempts.`}
      />
      <PublishDiffPanel diff={publishDiff} integrity={integrity} />
      <Card className="mt-5">
        {workspace && version ? (
          <PublishAssessmentForm
            assessmentId={workspace.assessment.id}
            versionId={version.id}
            students={students}
            groups={groups}
            cohorts={cohortWorkspace.cohorts.map(({ cohort, members }) => ({
              id: cohort.id,
              name: cohort.name,
              member_count: members.length,
            }))}
            templates={templates}
          />
        ) : (
          <p className="text-sm text-[var(--muted)]">No draft version is available to publish.</p>
        )}
      </Card>
    </>
  );
}
