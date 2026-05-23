import { SectionHeading } from "@/components/section-heading";
import { StudentProgressPanel } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentCommandCenterData } from "@/lib/student-experience";

export default async function StudentProgressPage() {
  const profile = await requireAppRole("student", "/student/progress");
  const data = await getStudentCommandCenterData(profile?.id ?? "");
  return (
    <>
      <SectionHeading title="Personal Progress Snapshot" description="Progress uses released marks, released feedback, receipts, correction status, and visible mistake categories only." />
      <StudentProgressPanel progress={data.progress} />
    </>
  );
}
