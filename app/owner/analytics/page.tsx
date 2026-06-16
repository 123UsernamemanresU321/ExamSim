import { AlertTriangle, BarChart3, CheckCircle2, FileText, Tags } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { listOwnerAssessments, listOwnerAttempts, listOwnerStudents } from "@/lib/live-data";

export default async function OwnerAnalyticsPage() {
  const [assessments, attempts, students] = await Promise.all([
    listOwnerAssessments(),
    listOwnerAttempts(),
    listOwnerStudents(),
  ]);
  const finishedAttempts = attempts.filter((attempt) => attempt.state === "FINISHED_REVIEW");
  const activeAttempts = attempts.filter((attempt) => attempt.state === "ACTIVE" || attempt.state === "UPLOAD_ONLY");
  const publishedAssessments = assessments.filter((assessment) => assessment.latest_status === "published");

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Review"
        title="Analytics / Performance"
        description="A compact review hub for released work, assessment coverage, topics, and recurring error patterns."
        actions={
          <>
            <ButtonLink href="/owner/topics" variant="secondary">
              <Tags size={16} aria-hidden="true" />
              Topics
            </ButtonLink>
            <ButtonLink href="/owner/mistakes" variant="secondary">
              <AlertTriangle size={16} aria-hidden="true" />
              Error Patterns
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Managed students" value={students.length} icon={<BarChart3 size={18} aria-hidden="true" />} />
        <StatCard label="Published assessments" value={publishedAssessments.length} icon={<FileText size={18} aria-hidden="true" />} />
        <StatCard label="Finished scripts" value={finishedAttempts.length} tone={finishedAttempts.length ? "success" : "neutral"} icon={<CheckCircle2 size={18} aria-hidden="true" />} />
        <StatCard label="Still in flight" value={activeAttempts.length} tone={activeAttempts.length ? "warning" : "neutral"} icon={<AlertTriangle size={18} aria-hidden="true" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-6">
          <SectionHeader
            title="Recent assessment coverage"
            description="Use this as the review entry point after marking and feedback release."
          />
          {assessments.length ? (
            <DataList className="mt-4">
              {assessments.slice(0, 8).map((assessment) => (
                <DataListRow key={assessment.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--ink)]">{assessment.title}</p>
                    <DataListMeta className="mt-1">
                      <span>{assessment.paper_code ?? "No paper code"}</span>
                      <span>{assessment.assessment_kind}</span>
                      <span>{assessment.latest_status ?? "draft"}</span>
                    </DataListMeta>
                  </div>
                  <ButtonLink href={`/owner/assessments/${assessment.id}`} variant="secondary">
                    Open
                  </ButtonLink>
                </DataListRow>
              ))}
            </DataList>
          ) : (
            <EmptyState title="No assessments yet" description="Build and publish an assessment before analytics can summarize performance." />
          )}
        </Card>

        <Card className="p-6">
          <SectionHeader title="Review tools" description="Focused pages for learning evidence and marking patterns." />
          <div className="mt-4 grid gap-3">
            <ButtonLink href="/owner/topics" variant="secondary" className="justify-start">
              <Tags size={16} aria-hidden="true" />
              Topic tagging and skills
            </ButtonLink>
            <ButtonLink href="/owner/mistakes" variant="secondary" className="justify-start">
              <AlertTriangle size={16} aria-hidden="true" />
              Error pattern taxonomy
            </ButtonLink>
            <ButtonLink href="/owner/feedback-releases" variant="secondary" className="justify-start">
              <CheckCircle2 size={16} aria-hidden="true" />
              Feedback release status
            </ButtonLink>
          </div>
        </Card>
      </div>
    </main>
  );
}
