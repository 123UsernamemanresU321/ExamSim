import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { listTopicDashboard } from "@/lib/usability-data";

export default async function TopicsPage() {
  const { tags, recommendations } = await listTopicDashboard();
  return (
    <>
      <SectionHeading
        title="Topics and Calendar Bridge"
        description="Tag questions with topics, review weak areas, and export revision recommendations for the adaptive calendar."
      />
      <div className="mb-5 flex justify-end"><ButtonLink href="/owner/standards" variant="secondary">Curriculum standards</ButtonLink></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Topic tags</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.length === 0 ? <p className="text-sm text-[var(--muted)]">No topic tags yet.</p> : tags.map((tag) => (
              <Badge key={tag.id} tone="neutral">{tag.subject} · {tag.tag}</Badge>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Calendar recommendations</h2>
          <div className="mt-4 grid gap-3">
            {recommendations.length === 0 ? <p className="text-sm text-[var(--muted)]">No weak-topic recommendations generated yet.</p> : recommendations.map((item) => (
              <div key={item.id} className="rounded-md border border-[var(--border)] p-3">
                <div className="mb-2 flex gap-2">
                  <Badge tone={item.priority === "high" ? "warning" : "neutral"}>{item.priority}</Badge>
                  <Badge tone="accent">{item.status}</Badge>
                </div>
                <p className="text-sm font-semibold">{item.reason}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{item.suggested_minutes} min · {item.paper_code ?? "No paper code"}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
