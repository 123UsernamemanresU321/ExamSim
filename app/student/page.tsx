import { AttemptList } from "@/components/attempt-list";
import { SectionHeading } from "@/components/section-heading";
import { listStudentAttempts } from "@/lib/live-data";

export default async function StudentDashboardPage() {
  const attempts = await listStudentAttempts();
  return (
    <>
      <SectionHeading
        title="Student dashboard"
        description="Assigned assessments show metadata before release. Content is requested only after server state permits it."
      />
      <AttemptList attempts={attempts} />
    </>
  );
}
