import { SectionHeading } from "@/components/section-heading";
import { StudentCommandCenter } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentCommandCenterData } from "@/lib/student-experience";

export default async function StudentCommandCenterPage() {
  const profile = await requireAppRole("student", "/student/command-center");
  const data = await getStudentCommandCenterData(profile?.id ?? "");

  return (
    <>
      <SectionHeading title="Student Command Center" description="Your exams, uploads, feedback, readiness, and account notices in one place." />
      <StudentCommandCenter data={data} />
    </>
  );
}
