import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { listOwnerAttempts } from "@/lib/live-data";

export default async function OwnerAttemptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attempts = await listOwnerAttempts();
  const attempt = attempts.find((item) => item.id === id);
  if (!attempt) {
    return <SectionHeading title="Attempt not found" description={`No attempt exists for ${id}.`} />;
  }
  return (
    <>
      <SectionHeading title={attempt.title} description={`${attempt.student} · ${attempt.paper_code}`} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Moderation report</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Review telemetry counts, heartbeat gaps, upload completeness, and timeline evidence.
          </p>
          <ButtonLink className="mt-4" href={`/owner/attempts/${id}/report`} variant="secondary">
            Open report
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Marking workspace</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Compare the original question tree with typed answers, upload slots, blank placeholders, and timestamps.
          </p>
          <ButtonLink className="mt-4" href={`/owner/attempts/${id}/mark`}>
            Mark
          </ButtonLink>
        </Card>
      </div>
    </>
  );
}
