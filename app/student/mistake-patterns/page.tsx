import { SectionHeading } from "@/components/section-heading";
import { StudentProgressPanel } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentCommandCenterData } from "@/lib/student-experience";

export default async function StudentMistakePatternsPage() {
  const profile = await requireAppRole("student", "/student/mistake-patterns");
  const data = await getStudentCommandCenterData(profile?.id ?? "");
  return (
    <>
      <SectionHeading title="Personal Mistake Pattern Summary" description="Only mistake categories explicitly released to you are included." />
      <StudentProgressPanel progress={data.progress} />
    </>
  );
}
