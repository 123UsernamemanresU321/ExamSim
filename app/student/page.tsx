import { AttemptList } from "@/components/attempt-list";
import { SectionHeading } from "@/components/section-heading";

export default function StudentDashboardPage() {
  return (
    <>
      <SectionHeading
        title="Student dashboard"
        description="Assigned assessments show metadata before release. Content is requested only after server state permits it."
      />
      <AttemptList />
    </>
  );
}
