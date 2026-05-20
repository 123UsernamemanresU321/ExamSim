import { MarkschemeMapperPanel } from "@/components/owner/markscheme-mapper-panel";
import { SectionHeading } from "@/components/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { getAssessmentWorkspace } from "@/lib/live-data";
import { listMarkschemeMappingWorkspace } from "@/lib/usability-data";

export default async function MarkschemeMapperPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const workspace = await getAssessmentWorkspace(assessmentId);
  if (!workspace) return <SectionHeading title="Assessment not found" description={`No assessment exists for ${assessmentId}.`} />;
  if (!workspace.latestVersion) {
    return <SectionHeading title="No version to map" description="Create or import an assessment version before mapping a markscheme." />;
  }

  const mapping = await listMarkschemeMappingWorkspace(workspace.latestVersion.id);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          title="Markscheme Mapper"
          description="Review extracted markscheme sections, ignore cover/general instructions, and map actual marking guidance to question nodes."
        />
        <ButtonLink href={`/owner/assessments/${assessmentId}/review`} variant="secondary">
          Back to parse review
        </ButtonLink>
      </div>
      <MarkschemeMapperPanel
        documents={mapping.documents}
        markschemeNodes={mapping.markschemeNodes}
        questionNodes={mapping.questionNodes}
      />
    </>
  );
}
