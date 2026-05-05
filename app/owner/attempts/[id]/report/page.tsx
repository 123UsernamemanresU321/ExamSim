import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { sampleReport } from "@/lib/demo-data";
import { getOwnerAttemptReviewWorkspace } from "@/lib/live-data";

export default async function AttemptReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getOwnerAttemptReviewWorkspace(id);
  const storedSummary = workspace.moderationReport?.summary_json;
  const report = workspace.moderationReport ? normalizeStoredReport(storedSummary) : sampleReport;
  return (
    <div className="mx-auto max-w-[1040px]">
      <SectionHeading
        title="Moderation report"
        description={`Attempt ${id}. Evidence is observational and does not automatically accuse.`}
      />
      <div className="mb-5 flex gap-2">
        <Badge tone={report.severity === "medium" ? "warning" : "neutral"}>
          Severity: {report.severity}
        </Badge>
        <Badge>{report.uploadTimingSummary}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Fullscreen exits", report.fullscreenExitCount],
          ["Hidden events", report.visibilityHiddenCount],
          ["Hidden seconds", report.estimatedHiddenSeconds],
          ["Blur events", report.windowBlurCount],
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
          {report.timeline.map((event) => (
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

function normalizeStoredReport(summary: unknown) {
  if (!summary || typeof summary !== "object") return sampleReport;
  const value = summary as Record<string, unknown>;
  const timeline = Array.isArray(value.timeline)
    ? value.timeline.map((event) => {
        const item = event as Record<string, unknown>;
        return {
          event_type: String(item.event_type ?? "event"),
          at: String(item.server_received_at ?? item.at ?? ""),
        };
      })
    : [];
  return {
    ...sampleReport,
    fullscreenExitCount: Number(value.fullscreenExitCount ?? 0),
    visibilityHiddenCount: Number(value.visibilityHiddenCount ?? 0),
    estimatedHiddenSeconds: Number(value.estimatedHiddenSeconds ?? 0),
    windowBlurCount: Number(value.windowBlurCount ?? 0),
    reconnectCount: Number(value.reconnectCount ?? 0),
    missingUploadSlots: Number(value.missingSlots ?? 0),
    blankPlaceholderCount: Number(value.blankPlaceholders ?? 0),
    uploadTimingSummary: `${Number(value.missingSlots ?? 0)} missing slots`,
    severity: Number(value.fullscreenExitCount ?? 0) > 0 || Number(value.visibilityHiddenCount ?? 0) > 0 ? "medium" : "none",
    timeline,
  };
}
