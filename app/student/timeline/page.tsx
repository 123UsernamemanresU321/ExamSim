import { SectionHeading } from "@/components/section-heading";
import { StudentAttemptTimeline } from "@/components/student/student-experience-panels";
import { ButtonLink } from "@/components/ui/button";
import { requireAppRole } from "@/lib/auth/server";
import { generateIcsCalendar, getStudentTimelineData } from "@/lib/student-experience";

export default async function StudentTimelinePage() {
  const profile = await requireAppRole("student", "/student/timeline");
  const attempts = await getStudentTimelineData(profile?.id ?? "");
  const upcoming = attempts.filter((attempt) => attempt.state === "WAITING" || attempt.state === "ACTIVE" || attempt.state === "UPLOAD_ONLY");
  const ics = generateIcsCalendar(
    upcoming.map((attempt) => ({
      id: attempt.id,
      title: attempt.title,
      paper_code: attempt.paper_code,
      start_at_utc: attempt.start_at_utc,
      end_at_utc: attempt.end_at_utc,
      upload_deadline_at_utc: attempt.upload_deadline_at_utc,
      display_timezone: attempt.display_timezone,
      exam_url: `/student/attempts/${attempt.id}/waiting`,
    })),
  );

  return (
    <>
      <SectionHeading title="Exam Timeline" description="Chronological start, end, upload-only, and feedback timing. Times are based on the Exam Vault server." />
      <div className="mb-5 flex flex-wrap gap-3">
        <a
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold !text-white hover:bg-[var(--primary-strong)]"
          href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
          download="exam-vault-upcoming.ics"
        >
          Export upcoming .ics
        </a>
        <ButtonLink href="/student/command-center" variant="secondary">Command Center</ButtonLink>
      </div>
      <StudentAttemptTimeline attempts={attempts} />
    </>
  );
}
