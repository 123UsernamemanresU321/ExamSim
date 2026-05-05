import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { sampleReport } from "@/lib/demo-data";

export default async function AttemptReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-[1040px]">
      <SectionHeading
        title="Moderation report"
        description={`Attempt ${id}. Evidence is observational and does not automatically accuse.`}
      />
      <div className="mb-5 flex gap-2">
        <Badge tone={sampleReport.severity === "medium" ? "warning" : "neutral"}>
          Severity: {sampleReport.severity}
        </Badge>
        <Badge>{sampleReport.uploadTimingSummary}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Fullscreen exits", sampleReport.fullscreenExitCount],
          ["Hidden events", sampleReport.visibilityHiddenCount],
          ["Hidden seconds", sampleReport.estimatedHiddenSeconds],
          ["Blur events", sampleReport.windowBlurCount],
        ].map(([label, value]) => (
          <Card key={String(label)} className="shadow-none">
            <p className="text-2xl font-semibold">{String(value)}</p>
            <p className="text-sm text-[var(--muted)]">{String(label)}</p>
          </Card>
        ))}
      </div>
      <Card className="paper-sheet mt-5">
        <h2 className="mb-4 text-lg font-semibold">Timeline</h2>
        <ol className="grid gap-3">
          {sampleReport.timeline.map((event) => (
            <li key={`${event.event_type}-${event.at}`} className="rounded-md border border-[var(--border)] bg-white p-3">
              <p className="font-mono text-sm">{event.event_type}</p>
              <p className="text-xs text-[var(--muted)]">{event.at}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
