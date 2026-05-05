import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { sampleAssessment } from "@/lib/demo-data";

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SectionHeading title={sampleAssessment.title} description={`Assessment ${id} · ${sampleAssessment.paper_code}`} />
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
        </Card>
      </div>
    </>
  );
}
