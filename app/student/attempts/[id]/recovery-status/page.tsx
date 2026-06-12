import { SectionHeading } from "@/components/section-heading";
import { RecoveryStatusPanel } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentRecoveryStatusData } from "@/lib/student-experience";

export default async function StudentRecoveryStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAppRole("student", `/student/attempts/${id}/recovery-status`);
  const data = await getStudentRecoveryStatusData(profile?.id ?? "", id);

  if (!data.attempt) {
    return <SectionHeading title="Attempt not found" description="Open the command center and choose an assigned attempt." />;
  }

  return (
    <>
      <SectionHeading title="Attempt Recovery Status" description="Safe view of upload problems, incident reports, owner extensions, and next actions." />
      <RecoveryStatusPanel attemptId={id} slots={data.slots} queueEvents={data.queueEvents} incidents={data.incidents} safeStatus={data.safeStatus} />
    </>
  );
}
