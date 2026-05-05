import { Plus } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listOwnerAssessments } from "@/lib/live-data";

export default async function OwnerAssessmentsPage() {
  const assessments = await listOwnerAssessments();
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading title="Assessments" description="Draft, parse review, and published assessment versions." />
        <ButtonLink href="/owner/assessments/new">
          <Plus size={16} aria-hidden="true" />
          New assessment
        </ButtonLink>
      </div>
      <div className="grid gap-3">
        {assessments.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--muted)]">No assessments yet.</p>
          </Card>
        ) : (
          assessments.map((assessment) => (
            <Card key={assessment.id} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 flex gap-2">
                  <Badge tone={assessment.latest_status === "published" ? "success" : "accent"}>
                    {assessment.latest_status ?? "no version"}
                  </Badge>
                  <Badge>{assessment.assessment_kind}</Badge>
                  {typeof assessment.parse_confidence === "number" ? (
                    <Badge tone={assessment.parse_confidence < 0.7 ? "warning" : "neutral"}>
                      parse {Math.round(assessment.parse_confidence * 100)}%
                    </Badge>
                  ) : null}
                </div>
                <h2 className="text-lg font-semibold">{assessment.title}</h2>
                <p className="text-sm text-[var(--muted)]">{assessment.paper_code}</p>
              </div>
              <ButtonLink href={`/owner/assessments/${assessment.id}`} variant="secondary">
                Open
              </ButtonLink>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
