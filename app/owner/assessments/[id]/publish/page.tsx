import { PublishAssessmentForm } from "@/components/owner/publish-assessment-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { getAssessmentWorkspace, listOwnerStudents } from "@/lib/live-data";

export default async function PublishAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workspace, students] = await Promise.all([getAssessmentWorkspace(id), listOwnerStudents()]);
  const version = workspace?.latestVersion;
  return (
    <>
      <SectionHeading
        title="Publish and assign"
        description={`Publish ${workspace?.assessment.title ?? id}. The server converts local start time to UTC and creates attempts.`}
      />
      <Card>
        {workspace && version ? (
          <PublishAssessmentForm assessmentId={workspace.assessment.id} versionId={version.id} students={students} />
        ) : (
          <p className="text-sm text-[var(--muted)]">No draft version is available to publish.</p>
        )}
      </Card>
    </>
  );
}
