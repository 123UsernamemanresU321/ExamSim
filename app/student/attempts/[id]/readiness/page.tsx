import { SectionHeading } from "@/components/section-heading";
import { ReadinessCheckPanel } from "@/components/student/student-interactive-panels";
import { ServerTimeVerificationCard } from "@/components/student/server-time-verification-card";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentReadinessData } from "@/lib/student-experience";

export default async function StudentAttemptReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAppRole("student", `/student/attempts/${id}/readiness`);
  const data = await getStudentReadinessData(profile?.id ?? "", id);

  if (!data.attempt) {
    return <SectionHeading title="Attempt not found" description="Open the command center and choose an assigned attempt." />;
  }

  return (
    <>
      <SectionHeading title="Exam Lobby Readiness" description={`${data.attempt.title}${data.attempt.paper_code ? ` · ${data.attempt.paper_code}` : ""}`} />
      <div className="mb-5 grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <ServerTimeVerificationCard serverNowUtc={data.serverNowUtc} timezone={data.attempt.display_timezone} />
        <Card>
          <p className="text-sm font-semibold text-[var(--ink)]">Latest stored readiness result</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {data.latestCheck ? `${data.latestCheck.status} at ${new Date(data.latestCheck.created_at).toLocaleString()}` : "No readiness check has been saved for this attempt yet."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href={`/student/attempts/${id}/waiting`} variant="secondary">Open waiting room</ButtonLink>
            <ButtonLink href="/student/devices" variant="secondary">Device profile</ButtonLink>
          </div>
        </Card>
      </div>
      <ReadinessCheckPanel attemptId={id} serverNowUtc={data.serverNowUtc} />
    </>
  );
}
