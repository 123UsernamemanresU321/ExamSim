import { SectionHeading } from "@/components/section-heading";
import { StudentDevicesPanel } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentDevicesData } from "@/lib/student-experience";

export default async function StudentDevicesPage() {
  const profile = await requireAppRole("student", "/student/devices");
  const data = await getStudentDevicesData(profile?.id ?? "");
  return (
    <>
      <SectionHeading title="Personal Device Profile" description="Track readiness checks for the devices and browsers you use for exams." />
      <StudentDevicesPanel devices={data.devices} checks={data.checks} />
    </>
  );
}
