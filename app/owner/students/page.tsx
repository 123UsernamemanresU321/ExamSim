import { CreateStudentGroupForm } from "@/components/owner/create-student-group-form";
import { CreateStudentForm } from "@/components/owner/create-student-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { listOwnerStudentGroups, listOwnerStudents } from "@/lib/live-data";

export default async function OwnerStudentsPage() {
  const [students, groups] = await Promise.all([listOwnerStudents(), listOwnerStudentGroups()]);
  return (
    <>
      <SectionHeading
        title="Students"
        description="Owner-created student accounts use login codes and one-time activation codes."
      />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Create student</h2>
            <CreateStudentForm />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Create group</h2>
            <CreateStudentGroupForm students={students} />
          </Card>
        </div>
        <div className="grid gap-3">
          <Card className="shadow-none">
            <h2 className="text-lg font-semibold">Groups</h2>
            {groups.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">No groups yet.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {groups.map((group) => (
                  <div key={group.id} className="rounded-md border border-[var(--border)] bg-white p-3">
                    <p className="font-semibold">{group.name}</p>
                    <p className="text-sm text-[var(--muted)]">{group.member_count} member(s)</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {students.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--muted)]">No students yet.</p>
            </Card>
          ) : (
            students.map((student) => (
              <Card key={student.id} className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{student.display_name}</h2>
                  <p className="text-sm text-[var(--muted)]">{student.login_code}</p>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {student.activated_at ? "Activated" : "Pending activation"}
                </p>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
