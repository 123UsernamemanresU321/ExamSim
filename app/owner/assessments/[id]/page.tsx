import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteAssessmentButton } from "@/components/owner/delete-assessment-button";
import { QtiExportButton } from "@/components/owner/qti-export-button";
import { SectionHeading } from "@/components/section-heading";
import { getAssessmentWorkspace } from "@/lib/live-data";
import { demoAssessmentParams } from "@/lib/static-params";

export function generateStaticParams() {
  return demoAssessmentParams();
}

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAssessmentWorkspace(id);
  if (!workspace) {
    return <SectionHeading title="Assessment not found" description={`No assessment exists for ${id}.`} />;
  }
  return (
    <>
      <SectionHeading
        title={workspace.assessment.title}
        description={`Assessment ${id} · ${workspace.assessment.paper_code ?? "No paper code"}`}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="text-lg font-semibold">Draft review</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Review deterministic parse output before publish.</p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/review`} variant="secondary">
            Review tree
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Publish and assign</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Freeze version, convert local time to UTC, and create attempts.</p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/publish`}>
            Publish
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Source security</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Source files and normalized packages are private and released through Edge Functions only.
          </p>
          <p className="mt-3 text-sm font-semibold text-[var(--primary)]">
            Latest version: {workspace.latestVersion?.status ?? "none"}
          </p>
          {workspace.latestVersion ? <div className="mt-4"><QtiExportButton versionId={workspace.latestVersion.id} /></div> : null}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Delete</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Permanently removes this assessment, versions, attempts, responses, parse jobs, reports, and known private
            Storage objects. Owner MFA is required.
          </p>
          <div className="mt-4">
            <DeleteAssessmentButton assessmentId={workspace.assessment.id} title={workspace.assessment.title} />
          </div>
        </Card>
      </div>
    </>
  );
}
