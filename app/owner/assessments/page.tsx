import { Plus } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sampleAssessment } from "@/lib/demo-data";

export default function OwnerAssessmentsPage() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading title="Assessments" description="Draft, parse review, and published assessment versions." />
        <ButtonLink href="/owner/assessments/new">
          <Plus size={16} aria-hidden="true" />
          New assessment
        </ButtonLink>
      </div>
      <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex gap-2">
            <Badge tone="success">published</Badge>
            <Badge>{sampleAssessment.assessment_kind}</Badge>
          </div>
          <h2 className="text-lg font-semibold">{sampleAssessment.title}</h2>
          <p className="text-sm text-[var(--muted)]">{sampleAssessment.paper_code}</p>
        </div>
        <ButtonLink href={`/owner/assessments/${sampleAssessment.id}`} variant="secondary">
          Open
        </ButtonLink>
      </Card>
    </>
  );
}
