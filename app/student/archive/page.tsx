import { SectionHeading } from "@/components/section-heading";
import { StudentArchive } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { listStudentAttemptCards } from "@/lib/student-experience";

export default async function StudentArchivePage() {
  const profile = await requireAppRole("student", "/student/archive");
  const attempts = await listStudentAttemptCards(profile?.id ?? "");
  return (
    <>
      <SectionHeading title="Completed Attempts Archive" description="Find old attempts, receipts, released scores, and correction links quickly." />
      <StudentArchive attempts={attempts} />
    </>
  );
}
