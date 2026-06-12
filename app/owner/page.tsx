import { AlertTriangle, ClipboardCheck, Clock, Users } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { StatCard } from "@/components/ui/stat-card";
import { ParseBadge, StatusBadge } from "@/components/ui/status-badge";
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scheduled attempts" value={attempts.length} icon={<Clock size={18} aria-hidden="true" />} />
        <StatCard label="Published versions" value={publishedCount} icon={<ClipboardCheck size={18} aria-hidden="true" />} />
        <StatCard label="Managed students" value={students.length} icon={<Users size={18} aria-hidden="true" />} />
        <StatCard label="Finished attempts" value={reviewCount} tone={reviewCount > 0 ? "warning" : "neutral"} icon={<AlertTriangle size={18} aria-hidden="true" />} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          {featuredAssessment ? (
            <DataList className="border-0 shadow-none">
              <DataListRow>
                <DataListMeta className="mb-2">
                  <StatusBadge status={featuredAssessment.latest_status} />
                  <ParseBadge confidence={featuredAssessment.parse_confidence} />
                </DataListMeta>
                <h2 className="text-base font-semibold text-[var(--ink)]">{featuredAssessment.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Latest assessment activity.</p>
              </DataListRow>
            </DataList>
          ) : (
            <p className="p-5 text-sm text-[var(--muted)]">No assessments yet.</p>
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
