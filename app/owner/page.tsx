import { AlertTriangle, ClipboardCheck, Clock, Users } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { sampleAssessment, sampleAttempts, sampleReport, sampleStudents } from "@/lib/demo-data";

export default function OwnerDashboardPage() {
  return (
    <>
      <SectionHeading
        title="Owner dashboard"
        description="Operational view for scheduling, assignments, parse review, and moderation evidence."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <Clock className="mb-3 text-[var(--accent)]" aria-hidden="true" />
          <p className="text-2xl font-semibold">{sampleAttempts.length}</p>
          <p className="text-sm text-[var(--muted)]">Scheduled attempts</p>
        </Card>
        <Card>
          <ClipboardCheck className="mb-3 text-[var(--accent)]" aria-hidden="true" />
          <p className="text-2xl font-semibold">1</p>
          <p className="text-sm text-[var(--muted)]">Published version</p>
        </Card>
        <Card>
          <Users className="mb-3 text-[var(--accent)]" aria-hidden="true" />
          <p className="text-2xl font-semibold">{sampleStudents.length}</p>
          <p className="text-sm text-[var(--muted)]">Managed students</p>
        </Card>
        <Card>
          <AlertTriangle className="mb-3 text-[var(--warning)]" aria-hidden="true" />
          <p className="text-2xl font-semibold">{sampleReport.severity}</p>
          <p className="text-sm text-[var(--muted)]">Moderation severity</p>
        </Card>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{sampleAssessment.title}</h2>
            <Badge tone="success">parse {Math.round(sampleAssessment.parse_confidence * 100)}%</Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Published immutable assessment version. Review and publish flows remain available for new drafts.
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Moderation report language</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{sampleReport.language}</p>
        </Card>
      </div>
    </>
  );
}
