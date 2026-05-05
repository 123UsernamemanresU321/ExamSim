import { AlertTriangle, ClipboardCheck, Clock, Users } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { sampleReport } from "@/lib/demo-data";
import { listOwnerAssessments, listOwnerAttempts, listOwnerStudents } from "@/lib/live-data";

export default async function OwnerDashboardPage() {
  const [assessments, attempts, students] = await Promise.all([
    listOwnerAssessments(),
    listOwnerAttempts(),
    listOwnerStudents(),
  ]);
  const publishedCount = assessments.filter((assessment) => assessment.latest_status === "published").length;
  const reviewCount = attempts.filter((attempt) => attempt.state === "FINISHED_REVIEW").length;
  const featuredAssessment = assessments[0];
  return (
    <>
      <SectionHeading
        title="Owner dashboard"
        description="Operational view for scheduling, assignments, parse review, and moderation evidence."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <Clock className="mb-3 text-[var(--accent)]" aria-hidden="true" />
          <p className="text-2xl font-semibold">{attempts.length}</p>
          <p className="text-sm text-[var(--muted)]">Scheduled attempts</p>
        </Card>
        <Card>
          <ClipboardCheck className="mb-3 text-[var(--accent)]" aria-hidden="true" />
          <p className="text-2xl font-semibold">{publishedCount}</p>
          <p className="text-sm text-[var(--muted)]">Published version</p>
        </Card>
        <Card>
          <Users className="mb-3 text-[var(--accent)]" aria-hidden="true" />
          <p className="text-2xl font-semibold">{students.length}</p>
          <p className="text-sm text-[var(--muted)]">Managed students</p>
        </Card>
        <Card>
          <AlertTriangle className="mb-3 text-[var(--warning)]" aria-hidden="true" />
          <p className="text-2xl font-semibold">{reviewCount}</p>
          <p className="text-sm text-[var(--muted)]">Finished attempts</p>
        </Card>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          {featuredAssessment ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{featuredAssessment.title}</h2>
                {typeof featuredAssessment.parse_confidence === "number" ? (
                  <Badge tone="success">parse {Math.round(featuredAssessment.parse_confidence * 100)}%</Badge>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Latest status: {featuredAssessment.latest_status ?? "no version"}.
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">No assessments yet.</p>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Moderation report language</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{sampleReport.language}</p>
        </Card>
      </div>
    </>
  );
}
