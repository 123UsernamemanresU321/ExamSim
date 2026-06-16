import { SectionHeading } from "@/components/section-heading";
import { CohortManager } from "@/components/owner/cohort-manager";
import { listCohortsWithMembers } from "@/lib/usability-data";

export default async function CohortsPage() {
  const { cohorts, students } = await listCohortsWithMembers();
  return (
    <>
      <SectionHeading
        title="Groups"
        description="Owner-managed classes and teaching groups for bulk assignment, queue filtering, and cross-student marking."
      />
      <div className="mb-6 rounded-lg border border-[var(--border)] bg-white p-4 text-sm text-[var(--muted)]">
        {students.length} student account{students.length === 1 ? "" : "s"} available for group membership. Group assignment expands to one attempt per current member.
      </div>
      <CohortManager cohorts={cohorts} students={students} />
    </>
  );
}
